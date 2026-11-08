-- =============================================
-- permission denied の修正（goal_plans / monthly_wants / meal_logs）
-- Supabase SQL Editor で実行してください
-- =============================================

grant select, insert, update on goal_plans to authenticated;
grant execute on function save_goal_plan(date, numeric, numeric, numeric, int, text, text, int, int, int, numeric, jsonb) to authenticated;

grant select, insert, update, delete on monthly_wants to authenticated;
grant select, insert, update, delete on meal_logs to authenticated;
