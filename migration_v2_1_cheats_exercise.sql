-- =============================================
-- v2.1 チートの中身・自由入力アイテム・運動の記録
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- 既存の monthly_wants / meal_logs のデータは変更しません
-- =============================================

-- 1. monthly_wants に中身の列を追加（既存の行はすべて null のまま → WANT_COSTS をデフォルトに使う）
alter table monthly_wants add column if not exists cheat_type text
  check (cheat_type is null or cheat_type in ('replace', 'addon'));
alter table monthly_wants add column if not exists replace_slot text
  check (replace_slot is null or replace_slot in ('morning', 'lunch', 'dinner'));
alter table monthly_wants add column if not exists items jsonb; -- [{genre, name, kcal, qty}]（登録時の kcal を保存）
alter table monthly_wants add column if not exists total_kcal int
  check (total_kcal is null or total_kcal >= 0);

-- kind に 'other'（ケーキ・焼肉など、既存の3種類に入らないチート）を追加
-- 既存の行は ramen / drinking_party / evening_drink のどれかなので、そのまま新しい制約を満たす
alter table monthly_wants drop constraint if exists monthly_wants_kind_check;
alter table monthly_wants add constraint monthly_wants_kind_check
  check (kind in ('ramen', 'drinking_party', 'evening_drink', 'other'));

-- 2. custom_cheat_items（一覧にないものを自由入力したアイテム。ユーザーごと）
create table if not exists custom_cheat_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  genre text not null,
  name text not null check (length(name) between 1 and 40),
  kcal int not null check (kcal > 0 and kcal <= 5000),
  created_at timestamptz default now(),
  unique (user_id, genre, name)
);

alter table custom_cheat_items enable row level security;

drop policy if exists "custom_cheat_items_own" on custom_cheat_items;
create policy "custom_cheat_items_own" on custom_cheat_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on custom_cheat_items to authenticated;

-- 3. exercise_logs（運動の記録。pt は月のメシポプールに加算）
--    時間で入れる（minutes）か、歩数で入れる（steps）かのどちらか
create table if not exists exercise_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  log_date date not null, -- 日本時間の日付を画面から渡す
  exercise_type text not null
    check (exercise_type in ('walking', 'running', 'weights', 'cycling', 'sports', 'steps')),
  minutes int check (minutes is null or (minutes > 0 and minutes <= 600)),
  steps int check (steps is null or (steps > 0 and steps <= 100000)),
  points int not null check (points >= 0),
  created_at timestamptz default now(),
  constraint exercise_logs_input check (
    (exercise_type = 'steps' and steps is not null and minutes is null)
    or (exercise_type <> 'steps' and minutes is not null and steps is null)
  )
);

create index if not exists exercise_logs_user_date_idx
  on exercise_logs (user_id, log_date);

alter table exercise_logs enable row level security;

drop policy if exists "exercise_logs_own" on exercise_logs;
create policy "exercise_logs_own" on exercise_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on exercise_logs to authenticated;
