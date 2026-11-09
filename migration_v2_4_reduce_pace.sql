-- =============================================
-- v2.2 減らすペース（docs/v2-spec.md 12-3）
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- user_profiles に列を1つ足すだけ。既存の行は「ゆっくり」になり、ほかの値は変えません
-- =============================================

-- 1. 減らすペース：keep 0 / slow −120 / normal −240 / hard −480（kcal/日。値は lib/calorieConstants.ts）
--    save_goal_plan（初回設定の保存）はこの列を触らないので、目標を立て直してもペースは残る
alter table user_profiles
  add column if not exists reduce_pace text not null default 'slow';

alter table user_profiles drop constraint if exists user_profiles_reduce_pace_check;
alter table user_profiles
  add constraint user_profiles_reduce_pace_check
  check (reduce_pace in ('keep', 'slow', 'normal', 'hard'));

-- 2. RLS（自分の行だけ）。schema.sql の users_own_data がなければ作る
alter table user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'users_own_data'
  ) then
    create policy "users_own_data" on user_profiles
      for all using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- 3. 設定画面から読み書きする
grant select, insert, update on user_profiles to authenticated;
