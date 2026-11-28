-- =============================================
-- v2.8.1 うごための時間（docs/v2-spec.md 18-追記 v2.8.1）
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- user_profiles に列を1つ足すだけ。既存の行はすべて30分になり、ほかの値は変えません
-- =============================================

-- 1. うごための時間：今日の画面の4つのボタンを押したときに記録する分数
--    値のチェック（15〜120分・15分刻み）は画面側（lib/calories.ts の normalizeExercisePresets）で行う
alter table user_profiles
  add column if not exists exercise_presets jsonb not null
  default '{"walking":30,"running":30,"weights":30,"sports":30}'::jsonb;

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

-- 3. 今日の画面・設定画面から読み書きする
grant select, insert, update on user_profiles to authenticated;
