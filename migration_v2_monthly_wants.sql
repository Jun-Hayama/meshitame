-- =============================================
-- v2 欲望の月登録 ＋ 毎日の食事記録
-- Supabase SQL Editor で実行してください
-- =============================================

-- 1. monthly_wants
--    日付指定: scheduled_date あり / times_per_week null
--    頻度ベース: scheduled_date null / times_per_week あり（毎週その回数）
create table if not exists monthly_wants (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  kind text not null check (kind in ('ramen', 'drinking_party', 'evening_drink')),
  scheduled_date date,
  times_per_week int check (times_per_week is null or (times_per_week >= 1 and times_per_week <= 7)),
  label text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint monthly_wants_mode check (
    (scheduled_date is not null and times_per_week is null)
    or (scheduled_date is null and times_per_week is not null)
  )
);

create index if not exists monthly_wants_user_active_idx
  on monthly_wants (user_id) where is_active;

create index if not exists monthly_wants_user_date_idx
  on monthly_wants (user_id, scheduled_date)
  where scheduled_date is not null and is_active;

alter table monthly_wants enable row level security;

drop policy if exists "monthly_wants_own" on monthly_wants;
create policy "monthly_wants_own" on monthly_wants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on monthly_wants to authenticated;

-- 2. meal_logs（朝・昼・夜の3択記録）
create table if not exists meal_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  log_date date not null,
  slot text not null check (slot in ('morning', 'lunch', 'dinner')),
  choice text not null check (choice in ('light', 'normal', 'hearty')),
  created_at timestamptz default now(),
  unique (user_id, log_date, slot)
);

create index if not exists meal_logs_user_date_idx
  on meal_logs (user_id, log_date);

alter table meal_logs enable row level security;

drop policy if exists "meal_logs_own" on meal_logs;
create policy "meal_logs_own" on meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on meal_logs to authenticated;
