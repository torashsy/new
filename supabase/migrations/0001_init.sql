-- かたち: 初期スキーマ
--
-- 設計上の約束:
--  1. 画像を格納するカラムを一切作らない。avatar_url も image_path も存在しない。
--     アイコンは axes から決定的に生成される図形なので、保存する必要がない。
--  2. 自由文のやりとり（チャット）用のテーブルを作らない。
--     テキストは必ず「特定の問いに対する回答」としてしか存在できない。
--  3. 「自分が答えるまで他人の答えは読めない」を RLS で実装する。
--     アプリ側の分岐だけに頼らない。

create extension if not exists "pgcrypto";

-- ── プロフィール ────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text not null unique check (char_length(handle) between 1 and 20),
  bio         text not null default '' check (char_length(bio) <= 140),
  -- 6軸。診断前は null。null の間は他人に表示されない。
  axes        jsonb check (
                axes is null or (
                  axes ?& array['pace','plan','depth','logic','novelty','expression']
                  and (select bool_and((value::int) between 0 and 100)
                       from jsonb_each_text(axes))
                )
              ),
  tags        text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 8),
  created_at  timestamptz not null default now()
);

create index profiles_tags_idx on public.profiles using gin (tags);

-- ── 日々の問いへの回答 ──────────────────────────────────────────
-- question_id はアプリ側の定数（lib/questions.ts）を指す。
-- 問い自体をテーブルにしないのは、全ユーザーが日付から同じ問いを導出するため。
create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  text not null,
  body         text not null check (char_length(body) between 1 and 140),
  created_at   timestamptz not null default now(),
  unique (user_id, question_id)
);

create index answers_question_idx on public.answers (question_id, created_at desc);

-- ── 一方向の「もっと知りたい」 ──────────────────────────────────
create table public.interests (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

-- ── 相互成立した接続 ────────────────────────────────────────────
-- user_a < user_b を強制して、同じ組が2行できないようにする。
create table public.connections (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

-- 相互に interest があるときだけ connection を作れるようにする
create or replace function public.assert_mutual_interest()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.interests i1
    join public.interests i2
      on i1.from_user_id = i2.to_user_id and i1.to_user_id = i2.from_user_id
    where i1.from_user_id = new.user_a and i1.to_user_id = new.user_b
  ) then
    raise exception '相互の interest がないため connection を作成できません';
  end if;
  return new;
end;
$$;

create trigger connections_require_mutual_interest
  before insert on public.connections
  for each row execute function public.assert_mutual_interest();

-- ── お題交換 ────────────────────────────────────────────────────
create table public.exchanges (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  prompt_id     text not null,
  prompt_text   text not null,
  opened_by     uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table public.exchange_answers (
  id          uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references public.exchanges (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 140),
  created_at  timestamptz not null default now(),
  unique (exchange_id, user_id)
);

-- ══ RLS ═════════════════════════════════════════════════════════
alter table public.profiles         enable row level security;
alter table public.answers          enable row level security;
alter table public.interests        enable row level security;
alter table public.connections      enable row level security;
alter table public.exchanges        enable row level security;
alter table public.exchange_answers enable row level security;

-- プロフィール: 診断が済んでいる人だけが他人から見える
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or axes is not null);
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());

-- 回答: 自分のものは常に見える。他人のものは「自分が同じ問いに答えている」ときだけ。
-- この1本のポリシーが、プロダクトの核になっているルールそのもの。
create policy answers_select on public.answers for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.answers mine
      where mine.user_id = auth.uid()
        and mine.question_id = answers.question_id
    )
  );
create policy answers_write on public.answers for insert
  with check (user_id = auth.uid());
create policy answers_update on public.answers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 興味: 自分が送ったものしか読めない。
-- 「誰から送られているか」は相互になるまで分からない（件数だけ別途集計で出す）。
create policy interests_select on public.interests for select
  using (from_user_id = auth.uid());
create policy interests_insert on public.interests for insert
  with check (from_user_id = auth.uid());
create policy interests_delete on public.interests for delete
  using (from_user_id = auth.uid());

create policy connections_select on public.connections for select
  using (user_a = auth.uid() or user_b = auth.uid());
create policy connections_insert on public.connections for insert
  with check (user_a = auth.uid() or user_b = auth.uid());

create policy exchanges_select on public.exchanges for select
  using (exists (
    select 1 from public.connections c
    where c.id = exchanges.connection_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));
create policy exchanges_insert on public.exchanges for insert
  with check (opened_by = auth.uid() and exists (
    select 1 from public.connections c
    where c.id = exchanges.connection_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

-- 交換の回答: 自分のものは常に。相手のものは「自分が答えている」ときだけ。
-- 日々の問いと同じ考え方を、1対1の場でも適用する。
create policy exchange_answers_select on public.exchange_answers for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.exchange_answers mine
      where mine.exchange_id = exchange_answers.exchange_id
        and mine.user_id = auth.uid()
    )
  );
create policy exchange_answers_insert on public.exchange_answers for insert
  with check (user_id = auth.uid());
create policy exchange_answers_update on public.exchange_answers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 相互 interest の件数だけを返す（誰からかは伏せる） ────────────
create or replace function public.incoming_interest_count()
returns integer language sql security definer set search_path = public as $$
  select count(*)::int
  from public.interests i
  where i.to_user_id = auth.uid()
    and not exists (
      select 1 from public.interests mine
      where mine.from_user_id = auth.uid() and mine.to_user_id = i.from_user_id
    );
$$;
