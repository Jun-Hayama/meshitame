-- =============================================
-- v2.8 フレンドと「一緒に食べる約束」（docs/v2-spec.md 18章）
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- 既存テーブルの RLS（自分の行だけ）と列は変えません
-- 友だちに見せるのは、見せてよい値だけを書き出した friend_profiles・friend_progress からだけ
-- 体重（kg）はどのテーブルにも入れません。weight_logs は今までどおり本人しか読めません
-- =============================================

-- 1. テーブル ------------------------------------------------

-- 表示名・キャラクター・隠す設定（本人が書く）
create table if not exists friend_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 12),
  character_emoji text not null default '🐷' check (character_emoji in ('🐷', '🐔', '🐮', '🐻', '🐱', '🐶')),
  hide_cheats boolean not null default false,
  updated_at timestamptz not null default now()
);

-- コースに出す値（本人の画面で計算して書き出す）。kg は入れない
create table if not exists friend_progress (
  user_id uuid primary key references auth.users on delete cascade,
  approach_pct int check (approach_pct is null or approach_pct between 0 and 100), -- null = 目標体重なし
  detour boolean not null default false, -- ちょっと寄り道中
  water_emoji text, -- むくみ中の絵文字（むくみ中でなければ null）
  water_return_date date, -- むくみ中の戻りそうな日
  footprints jsonb not null default '[]'::jsonb, -- [{ pct, emoji, count, look }]
  cheat_counts jsonb not null default '[]'::jsonb, -- [{ emoji, count }]
  updated_at timestamptz not null default now()
);

-- 友だち（両方向の2行で持つ）
create table if not exists friendships (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_not_self check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on friendships (friend_id);

-- 一緒に食べる約束
create table if not exists promises (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users on delete cascade,
  promise_date date not null,
  place text not null check (place in ('lunch', 'dinner', 'extra')),
  items jsonb not null default '[]'::jsonb, -- [{ genre, name, kcal, qty }]（アイテム表の品、または自由入力の名前）
  label text not null check (char_length(label) between 1 and 200),
  venue text check (venue is null or char_length(venue) <= 30),
  status text not null default 'active' check (status in ('active', 'canceled')),
  created_at timestamptz not null default now()
);

-- 約束の参加者（作った人も入る。定員6人）
create table if not exists promise_members (
  promise_id uuid not null references promises on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  ready_pct int check (ready_pct is null or ready_pct between 0 and 100), -- null = 約束の月がまだ
  updated_at timestamptz,
  cheat_id uuid, -- 自分の予定のチート（monthly_wants.id）
  primary key (promise_id, user_id)
);
create index if not exists promise_members_user_idx on promise_members (user_id);

-- 招待のリンク（promise_id が null なら友だちの招待だけ）
create table if not exists friend_invites (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users on delete cascade,
  token text not null unique,
  promise_id uuid references promises on delete cascade,
  expires_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists friend_invites_creator_idx on friend_invites (creator_id);

-- 2. 判定用の関数（RLS から呼ぶ。自分のテーブルを参照して無限ループにならないよう security definer） ----

create or replace function is_friend(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_id = auth.uid() and friend_id = uid)
$$;

create or replace function is_promise_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from promise_members where promise_id = pid and user_id = auth.uid())
$$;

-- 同じ約束の参加者か（表示名とキャラクターを見せるため）
create or replace function shares_promise(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from promise_members a
    join promise_members b on a.promise_id = b.promise_id
    where a.user_id = auth.uid() and b.user_id = uid
  )
$$;

-- 3. RLS ------------------------------------------------------

alter table friend_profiles enable row level security;
alter table friend_progress enable row level security;
alter table friendships enable row level security;
alter table promises enable row level security;
alter table promise_members enable row level security;
alter table friend_invites enable row level security;

drop policy if exists friend_profiles_select on friend_profiles;
create policy friend_profiles_select on friend_profiles
  for select using (user_id = auth.uid() or is_friend(user_id) or shares_promise(user_id));
drop policy if exists friend_profiles_insert on friend_profiles;
create policy friend_profiles_insert on friend_profiles
  for insert with check (user_id = auth.uid());
drop policy if exists friend_profiles_update on friend_profiles;
create policy friend_profiles_update on friend_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists friend_progress_select on friend_progress;
create policy friend_progress_select on friend_progress
  for select using (user_id = auth.uid() or is_friend(user_id));
drop policy if exists friend_progress_insert on friend_progress;
create policy friend_progress_insert on friend_progress
  for insert with check (user_id = auth.uid());
drop policy if exists friend_progress_update on friend_progress;
create policy friend_progress_update on friend_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists friendships_select on friendships;
create policy friendships_select on friendships
  for select using (user_id = auth.uid());

drop policy if exists promises_select on promises;
create policy promises_select on promises
  for select using (is_promise_member(id));

drop policy if exists promise_members_select on promise_members;
create policy promise_members_select on promise_members
  for select using (is_promise_member(promise_id));
drop policy if exists promise_members_update on promise_members;
create policy promise_members_update on promise_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists friend_invites_select on friend_invites;
create policy friend_invites_select on friend_invites
  for select using (creator_id = auth.uid());

-- 4. grant（書き込みは本人の表示用の値だけ。ほかは関数経由） -------------

revoke all on friend_profiles, friend_progress, friendships, promises, promise_members, friend_invites from anon, authenticated;
grant select, insert, update on friend_profiles to authenticated;
grant select, insert, update on friend_progress to authenticated;
grant select on friendships to authenticated;
grant select on promises to authenticated;
grant select on promise_members to authenticated;
grant update (ready_pct, updated_at, cheat_id) on promise_members to authenticated;
grant select on friend_invites to authenticated;

-- 5. 操作用の関数（security definer。チェックはすべてここで行う） -------------

create or replace function jst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

-- 招待の状態。own / stopped / expired / canceled / past / already / full / friend_limit / ok
-- uid が null（未ログイン）なら、本人にかかわる判定（own / already / friend_limit）はしない
create or replace function invite_status(inv friend_invites, uid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p promises;
  member_count int;
  already_friend boolean;
begin
  if uid is not null and inv.creator_id = uid then return 'own'; end if;
  if inv.stopped_at is not null then return 'stopped'; end if;
  if inv.expires_at <= now() then return 'expired'; end if;
  if inv.promise_id is not null then
    select * into p from promises where id = inv.promise_id;
    if not found or p.status = 'canceled' then return 'canceled'; end if;
    if p.promise_date < jst_today() then return 'past'; end if;
  end if;
  if uid is null then return 'ok'; end if;
  already_friend := exists (select 1 from friendships where user_id = uid and friend_id = inv.creator_id);
  if inv.promise_id is not null then
    if exists (select 1 from promise_members where promise_id = inv.promise_id and user_id = uid) then return 'already'; end if;
    select count(*) into member_count from promise_members where promise_id = inv.promise_id;
    if member_count >= 6 then return 'full'; end if;
  elsif already_friend then
    return 'already';
  end if;
  if not already_friend and (
    (select count(*) from friendships where user_id = uid) >= 10
    or (select count(*) from friendships where user_id = inv.creator_id) >= 10
  ) then
    return 'friend_limit';
  end if;
  return 'ok';
end $$;

-- 約束を作る（作った人を参加者に入れる）。日付は明日から60日以内
create or replace function create_promise(p_date date, p_place text, p_items jsonb, p_label text, p_venue text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from friend_profiles where user_id = uid) then raise exception 'no_profile'; end if;
  if p_date < jst_today() + 1 or p_date > jst_today() + 60 then raise exception 'bad_date'; end if;
  insert into promises (creator_id, promise_date, place, items, label, venue)
  values (uid, p_date, p_place, coalesce(p_items, '[]'::jsonb), p_label, nullif(trim(coalesce(p_venue, '')), ''))
  returning id into pid;
  insert into promise_members (promise_id, user_id) values (pid, uid);
  return pid;
end $$;

-- 招待を作る。友だちの招待は7日、約束の誘いは「7日後」と「約束の日の前日の終わり」の早いほうまで
create or replace function create_invite(p_promise_id uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p promises;
  expires timestamptz := now() + interval '7 days';
  tok text := replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from friend_profiles where user_id = uid) then raise exception 'no_profile'; end if;
  if p_promise_id is not null then
    select * into p from promises where id = p_promise_id;
    if not found or p.creator_id <> uid then raise exception 'not_creator'; end if;
    if p.status <> 'active' then raise exception 'canceled'; end if;
    expires := least(expires, (p.promise_date::timestamp) at time zone 'Asia/Tokyo');
    if expires <= now() then raise exception 'expired'; end if;
  end if;
  insert into friend_invites (creator_id, token, promise_id, expires_at) values (uid, tok, p_promise_id, expires);
  return tok;
end $$;

-- リンクを止める（作った人だけ）
create or replace function stop_invite(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update friend_invites set stopped_at = now()
  where token = p_token and creator_id = auth.uid() and stopped_at is null;
end $$;

-- 招待の中身を見る（未ログインでも呼べる）。見せてよい値だけを返す
create or replace function get_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  inv friend_invites;
  prof friend_profiles;
  p promises;
begin
  select * into inv from friend_invites where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into prof from friend_profiles where user_id = inv.creator_id;
  if inv.promise_id is not null then select * into p from promises where id = inv.promise_id; end if;
  return jsonb_build_object(
    'status', invite_status(inv, auth.uid()),
    'creator_name', prof.display_name,
    'creator_character', prof.character_emoji,
    'promise', case when p.id is null then null else jsonb_build_object(
      'date', p.promise_date, 'place', p.place, 'items', p.items, 'label', p.label, 'venue', p.venue,
      'status', p.status
    ) end
  );
end $$;

-- 招待で参加する：友だちになる（まだなら）＋ 約束の参加者になる（約束の誘いなら）
create or replace function join_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv friend_invites;
  p promises;
  st text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from friend_profiles where user_id = uid) then
    return jsonb_build_object('status', 'no_profile');
  end if;
  select * into inv from friend_invites where token = p_token for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inv.promise_id is not null then
    select * into p from promises where id = inv.promise_id for update; -- 定員のチェックを同時に通さない
  end if;
  st := invite_status(inv, uid);
  if st <> 'ok' then return jsonb_build_object('status', st); end if;

  insert into friendships (user_id, friend_id) values (uid, inv.creator_id), (inv.creator_id, uid)
  on conflict do nothing;
  if inv.promise_id is not null then
    insert into promise_members (promise_id, user_id) values (inv.promise_id, uid) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'promise', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'date', p.promise_date, 'place', p.place, 'items', p.items, 'label', p.label
    ) end
  );
end $$;

-- 約束を取りやめる（作った人だけ）。誘いのリンクも止める。各自の予定のチートは残す
create or replace function cancel_promise(p_promise_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update promises set status = 'canceled'
  where id = p_promise_id and creator_id = auth.uid() and status = 'active';
  if not found then raise exception 'not_creator'; end if;
  update friend_invites set stopped_at = now() where promise_id = p_promise_id and stopped_at is null;
end $$;

-- 約束から抜ける（作った人は抜けられない）。予定のチートは残す
create or replace function leave_promise(p_promise_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from promises where id = p_promise_id and creator_id = auth.uid()) then
    raise exception 'creator';
  end if;
  delete from promise_members where promise_id = p_promise_id and user_id = auth.uid();
end $$;

-- 友だちをやめる（双方から消える）。一緒に参加している約束からは抜けない
create or replace function unfriend(p_friend_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships
  where (user_id = auth.uid() and friend_id = p_friend_id) or (user_id = p_friend_id and friend_id = auth.uid());
end $$;

-- 6. 関数の実行権限（Supabase はふつう public に実行権限がつくので、いったん外してからつける） ----

revoke execute on function is_friend(uuid) from public, anon;
revoke execute on function is_promise_member(uuid) from public, anon;
revoke execute on function shares_promise(uuid) from public, anon;
revoke execute on function invite_status(friend_invites, uuid) from public, anon, authenticated;
revoke execute on function create_promise(date, text, jsonb, text, text) from public, anon;
revoke execute on function create_invite(uuid) from public, anon;
revoke execute on function stop_invite(text) from public, anon;
revoke execute on function get_invite(text) from public;
revoke execute on function join_invite(text) from public, anon;
revoke execute on function cancel_promise(uuid) from public, anon;
revoke execute on function leave_promise(uuid) from public, anon;
revoke execute on function unfriend(uuid) from public, anon;

grant execute on function is_friend(uuid) to authenticated;
grant execute on function is_promise_member(uuid) to authenticated;
grant execute on function shares_promise(uuid) to authenticated;
grant execute on function jst_today() to authenticated, anon;
grant execute on function create_promise(date, text, jsonb, text, text) to authenticated;
grant execute on function create_invite(uuid) to authenticated;
grant execute on function stop_invite(text) to authenticated;
grant execute on function get_invite(text) to authenticated, anon;
grant execute on function join_invite(text) to authenticated;
grant execute on function cancel_promise(uuid) to authenticated;
grant execute on function leave_promise(uuid) to authenticated;
grant execute on function unfriend(uuid) to authenticated;
