-- =============================================
-- v2.2 体重を毎朝1日1件に（docs/v2-spec.md 11-1）
-- Supabase SQL Editor で実行してください（何度実行しても大丈夫）
-- 既存の weight_logs に同じ日の重複がないことは確認済み（2026-11-08）
-- =============================================

-- 1. 1日1件。同じ日に入れ直したら画面から upsert で上書きする
alter table weight_logs drop constraint if exists weight_logs_user_date_unique;
alter table weight_logs add constraint weight_logs_user_date_unique unique (user_id, measured_at);

-- 2. DBの current_date はUTCなので既定値を外す（日本時間の日付を画面から必ず渡す）
alter table weight_logs alter column measured_at drop default;

-- 3. RLS（schema.sql の "users_own_data" が本番に無い場合に備えて、ここでも付ける）
alter table weight_logs enable row level security;

drop policy if exists "weight_logs_own" on weight_logs;
create policy "weight_logs_own" on weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on weight_logs to authenticated;
