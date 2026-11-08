-- =============================================
-- v2.3 月の割り直し（docs/v2-spec.md 11-3）・ゲート達成（11-5）
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- 既存のテーブルは変更しません
-- =============================================

-- 1. monthly_targets（月初に1回だけ決めた、その月の目標）
--    開始月・期間後・まだ来ていない月は保存しない（計画どおりの値を lib/calories.ts で出す）
--    初回設定をやり直すと goal_plan_id が変わるので、前の目標の行は使われない
create table if not exists monthly_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  goal_plan_id uuid references goal_plans (id) on delete cascade not null,
  year int not null,
  month int not null check (month between 1 and 12),
  month_number int not null check (month_number >= 2),
  gate_index int not null check (gate_index >= 1),
  basis text not null check (basis in ('plan', 'rebalanced')), -- plan：月初の7日平均が参考値なので計画どおり
  start_avg_kg numeric(6,2),          -- 月初の7日平均（前月の最後の7日間）
  start_avg_count int not null default 0,
  gate_end_target_kg numeric(6,2) not null,
  remaining_months int not null check (remaining_months >= 1),
  monthly_target_kg numeric(7,3) not null, -- 0以下なら先行（1日の貯金0）
  daily_saving_kcal int not null check (daily_saving_kcal >= 0),
  uncapped_kcal int not null,
  cap_kcal int not null,
  capped boolean not null default false,
  shortfall_kg numeric(6,2) not null default 0, -- capped のとき、ゲートに届かない見込み
  capped_dismissed boolean not null default false, -- capped の案内で「そのまま続ける」を選んだ
  created_at timestamptz default now(),
  -- 1回だけ決める。2台で同時に開いても insert ... on conflict do nothing で1行になる
  unique (goal_plan_id, year, month)
);

alter table monthly_targets enable row level security;

drop policy if exists "monthly_targets_own" on monthly_targets;
create policy "monthly_targets_own" on monthly_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on monthly_targets to authenticated;

-- 2. goal_milestones（ゲート達成・3%・5% を1回だけ出すための記録）
create table if not exists goal_milestones (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  goal_plan_id uuid references goal_plans (id) on delete cascade not null,
  kind text not null check (kind in ('gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6', 'gate7', 'gate8', 'loss3', 'loss5')),
  achieved_on date not null, -- 日本時間の日付を画面から渡す
  created_at timestamptz default now(),
  unique (goal_plan_id, kind)
);

alter table goal_milestones enable row level security;

drop policy if exists "goal_milestones_own" on goal_milestones;
create policy "goal_milestones_own" on goal_milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert on goal_milestones to authenticated;
