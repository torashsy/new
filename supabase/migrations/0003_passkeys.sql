-- パスキー（WebAuthn）。パスワードは持たない。
--
-- 【接続方法についての注意】
-- 0001 の RLS は auth.uid() を前提に書いてある。
-- ここでアプリ自前のパスキー認証を持つ以上、Supabase Auth のセッションは
-- 発行されないので、そのままでは auth.uid() が null になり全ポリシーが落ちる。
--
-- 取りうる道は2つ:
--   A. パスキー検証が通った時点で、Supabase の JWT シークレットで
--      sub = profiles.id の JWT を自前で発行する（RLS はそのまま使える）
--   B. Supabase Auth 側のパスキー対応に寄せて、この表を使わない
-- どちらにするかは docs/open-questions.md 参照。いまは A を前提にしている。

create table public.credentials (
  -- base64url のクレデンシャルID。認証器が発行するのでこれが主キーになる。
  id           text primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- base64url の公開鍵。秘密鍵は端末から出ないので、こちらには存在しない。
  public_key   text not null,
  -- 複製された認証器の検出に使う。認証のたびに増える。
  counter      bigint not null default 0,
  transports   text[] not null default '{}',
  label        text not null default '',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index credentials_user_idx on public.credentials (user_id);

-- 登録・認証の途中で使う一時値。使い捨て。
create table public.challenges (
  id             uuid primary key default gen_random_uuid(),
  value          text not null,
  user_id        uuid references public.profiles (id) on delete cascade,
  pending_handle text,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index challenges_expiry_idx on public.challenges (expires_at);

alter table public.credentials enable row level security;
alter table public.challenges  enable row level security;

-- 自分の鍵の一覧だけ見られる（端末の登録を解除するため）。
-- 追加と検証はサーバ側（service_role）が行う。
create policy credentials_select on public.credentials for select
  using (user_id = auth.uid());
create policy credentials_delete on public.credentials for delete
  using (user_id = auth.uid());

-- challenges は誰にも読ませない。service_role のみが触る。

-- 最後の1本を消せないようにする。消せてしまうとログイン手段がなくなる。
create or replace function public.assert_last_credential()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.credentials where user_id = old.user_id) <= 1 then
    raise exception '最後のパスキーは削除できません';
  end if;
  return old;
end;
$$;

create trigger credentials_keep_last
  before delete on public.credentials
  for each row execute function public.assert_last_credential();

-- 期限切れのチャレンジを掃除する。アプリ側でも発行時に消しているが、
-- 使われないまま溜まる分をここで落とす。
create or replace function public.purge_expired_challenges()
returns void language sql security definer set search_path = public as $$
  delete from public.challenges where expires_at < now();
$$;
