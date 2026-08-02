-- 通報とブロック。
-- 判断待ちの機能ではなく、公開する前に必ず要るもの。

create table public.blocks (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create index blocks_to_idx on public.blocks (to_user_id);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id   uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('attack','sexual','commercial','impersonation','other')),
  -- 対象の回答や交換があれば記録する
  context_id   text,
  note         text not null default '' check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index reports_to_idx on public.reports (to_user_id, created_at desc);

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

-- ブロックは自分が作ったものしか読めない。
-- 「ブロックされた」ことが相手に分かってはいけないので、to_user_id 側には見せない。
create policy blocks_select on public.blocks for select
  using (from_user_id = auth.uid());
create policy blocks_insert on public.blocks for insert
  with check (from_user_id = auth.uid());
create policy blocks_delete on public.blocks for delete
  using (from_user_id = auth.uid());

-- 通報は書けるだけ。読むのは運営（service_role）のみ。
create policy reports_insert on public.reports for insert
  with check (from_user_id = auth.uid());

-- ══ ブロックを既存のポリシーに反映する ══════════════════════════
-- 双方向。自分がブロックした相手も、自分をブロックした相手も見えなくする。
create or replace function public.is_hidden(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks b
    where (b.from_user_id = auth.uid() and b.to_user_id = other)
       or (b.from_user_id = other and b.to_user_id = auth.uid())
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or (axes is not null and not public.is_hidden(id)));

drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select
  using (
    user_id = auth.uid()
    or (
      not public.is_hidden(user_id)
      and exists (
        select 1 from public.answers mine
        where mine.user_id = auth.uid()
          and mine.question_id = answers.question_id
      )
    )
  );

-- ブロックしている相手には interest を送れない
create or replace function public.assert_not_blocked()
returns trigger language plpgsql as $$
begin
  if public.is_hidden(new.to_user_id) then
    raise exception 'ブロックしている、またはされている相手には送れません';
  end if;
  return new;
end;
$$;

create trigger interests_reject_blocked
  before insert on public.interests
  for each row execute function public.assert_not_blocked();

-- ══ 1日あたりの送信上限 ═════════════════════════════════════════
-- 無制限だと「全員に送る」が最適戦略になってしまう。
-- 数はアプリ側 (lib/limits.ts) と揃えること。
create or replace function public.assert_interest_budget()
returns trigger language plpgsql as $$
declare
  sent_today integer;
begin
  select count(*) into sent_today
  from public.interests
  where from_user_id = new.from_user_id
    and created_at >= date_trunc('day', now());

  if sent_today >= 5 then
    raise exception '今日はもう送れません';
  end if;
  return new;
end;
$$;

create trigger interests_daily_budget
  before insert on public.interests
  for each row execute function public.assert_interest_budget();
