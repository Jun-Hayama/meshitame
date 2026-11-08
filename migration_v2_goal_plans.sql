-- =============================================
-- v2 初回設定：goal_plans テーブル ＋ 保存用 RPC
-- Supabase SQL Editor で実行してください
-- =============================================

-- 1. goal_plans（入力値と目標の骨組み）
--    1日の貯金・目安は月ごとに変わるので保存せず、gates から毎回計算する
create table if not exists goal_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  start_date date not null, -- 日本時間の日付を画面から渡す（DBの current_date はUTCのため）
  period_months int not null check (period_months > 0 and period_months % 3 = 0),
  height_cm numeric(5,1) not null,
  start_weight_kg numeric(5,1) not null,
  target_weight_kg numeric(5,1) not null,
  age int not null,
  sex text not null check (sex in ('male', 'female', 'other')),
  activity_level text not null check (activity_level in ('low', 'moderate', 'high')),
  bmr int not null,
  tdee int not null,
  target_loss_kg numeric(5,2) not null,
  gates jsonb not null, -- Gate[]（lib/calories.ts の calcGates の結果）
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 有効な目標は1人1つだけ
create unique index if not exists goal_plans_one_active_per_user
  on goal_plans (user_id) where is_active;

alter table goal_plans enable row level security;

drop policy if exists "goal_plans_own" on goal_plans;
create policy "goal_plans_own" on goal_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RLS だけでは不十分。authenticated にテーブル権限が必要
grant select, insert, update on goal_plans to authenticated;

-- 2. 保存用 RPC
--    user_profiles の更新・古い目標の無効化・新しい目標の挿入を1トランザクションで行う
--    （途中で失敗したらすべて元に戻る）
--    security invoker なので RLS はそのまま効く
create or replace function save_goal_plan(
  p_start_date date,
  p_height_cm numeric,
  p_start_weight_kg numeric,
  p_target_weight_kg numeric,
  p_age int,
  p_sex text,
  p_activity_level text,
  p_period_months int,
  p_bmr int,
  p_tdee int,
  p_target_loss_kg numeric,
  p_gates jsonb
) returns goal_plans
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan goal_plans;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into user_profiles (id, height_cm, weight_kg, target_weight_kg, age, sex, activity_level, base_calories)
  values (v_user_id, p_height_cm, p_start_weight_kg, p_target_weight_kg, p_age, p_sex, p_activity_level, p_tdee)
  on conflict (id) do update set
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    target_weight_kg = excluded.target_weight_kg,
    age = excluded.age,
    sex = excluded.sex,
    activity_level = excluded.activity_level,
    base_calories = excluded.base_calories;

  update goal_plans set is_active = false
  where user_id = v_user_id and is_active;

  insert into goal_plans (
    user_id, start_date, period_months, height_cm, start_weight_kg, target_weight_kg, age, sex,
    activity_level, bmr, tdee, target_loss_kg, gates
  ) values (
    v_user_id, p_start_date, p_period_months, p_height_cm, p_start_weight_kg, p_target_weight_kg, p_age, p_sex,
    p_activity_level, p_bmr, p_tdee, p_target_loss_kg, p_gates
  )
  returning * into v_plan;

  return v_plan;
end;
$$;

grant execute on function save_goal_plan(date, numeric, numeric, numeric, int, text, text, int, int, int, numeric, jsonb) to authenticated;
