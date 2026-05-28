-- =============================================
-- block_templates メイン＋セット方式 マイグレーション
-- Supabase SQL Editor で実行してください
-- =============================================

-- 1. metadata カラムを追加（なければ）
alter table block_templates
  add column if not exists metadata jsonb;

-- 2. システムデフォルトテンプレートをクリア
delete from block_templates where user_id is null;

-- 3. 新しいメインメニューテンプレートを挿入
insert into block_templates
  (block_type, name, calories, emoji, is_want, metadata)
values

-- ヘルシー系
('meal_lunch', '焼き魚',       200,  '🐟', false, '{"category":"healthy","description":"塩焼き・西京焼きなど魚料理"}'),
('meal_lunch', 'サラダチキン', 180,  '🥗', false, '{"category":"healthy","description":"コンビニやスーパーのサラダチキン単品"}'),
('meal_lunch', '蕎麦',         400,  '🍵', false, '{"category":"healthy","description":"もり・ざる・かけ蕎麦など"}'),
('meal_lunch', '刺身',         250,  '🐠', false, '{"category":"healthy","description":"刺身盛り合わせ"}'),

-- ノーマル系
('meal_lunch', '牛丼',         650,  '🍚', false, '{"category":"normal","description":"吉野家・すき家・松屋など"}'),
('meal_lunch', 'カレー',       700,  '🍛', false, '{"category":"normal","description":"一般的なカレーライス"}'),
('meal_lunch', '親子丼',       600,  '🍳', false, '{"category":"normal","description":"親子丼・他人丼など"}'),
('meal_lunch', 'パスタ',       650,  '🍝', false, '{"category":"normal","description":"ナポリタン・ペペロンチーノなど"}'),
('meal_lunch', '唐揚げ',       450,  '🍗', false, '{"category":"normal","description":"唐揚げ単品・3〜4個"}'),
('meal_lunch', 'ハンバーグ',   500,  '🍖', false, '{"category":"normal","description":"ハンバーグ単品"}'),
('meal_lunch', '寿司',         500,  '🍣', false, '{"category":"normal","description":"回転寿司・スーパー寿司10貫程度"}'),
('meal_lunch', 'うどん',       450,  '🍜', false, '{"category":"normal","description":"きつね・天ぷらうどんなど"}'),
('meal_lunch', '海鮮丼',       550,  '🐙', false, '{"category":"normal","description":"海鮮丼・ちらし寿司など"}'),

-- ジャンキー系
('meal_lunch', '二郎系',       1200, '🍜', true,  '{"category":"junk","description":"大盛り・ニンニク・背脂系"}'),
('meal_lunch', '焼肉',         800,  '🥩', true,  '{"category":"junk","description":"焼肉店での食事"}'),
('meal_lunch', 'バーガー',     700,  '🍔', true,  '{"category":"junk","description":"ハンバーガーセット"}'),
('meal_lunch', 'ピザ',         900,  '🍕', true,  '{"category":"junk","description":"ピザ（Mサイズ半分程度）"}'),
('meal_lunch', '担々麺',       850,  '🍜', true,  '{"category":"junk","description":"担々麺・台湾まぜそばなど"}'),
('meal_lunch', 'ステーキ',     900,  '🥩', true,  '{"category":"junk","description":"ステーキ200g程度"}'),
('meal_lunch', 'もつ鍋',       700,  '🫕', true,  '{"category":"junk","description":"もつ鍋・キムチ鍋など"}'),
('meal_lunch', 'お好み焼き',   700,  '🥞', true,  '{"category":"junk","description":"お好み焼き・たこ焼きなど粉もの"}'),

-- 朝食（既存維持）
('meal_morning', 'ヨーグルト+フルーツ', 200, '🥣', false, '{"category":"healthy"}'),
('meal_morning', '卵かけご飯',          300, '🍚', false, '{"category":"healthy"}'),
('meal_morning', 'プロテイン+バナナ',   250, '🍌', false, '{"category":"healthy"}'),
('meal_morning', 'トースト+目玉焼き',   350, '🍳', false, '{"category":"normal"}'),

-- おやつ（既存維持）
('meal_snack', 'チョコ1かけ',     100, '🍫', false, '{"category":"healthy"}'),
('meal_snack', 'ナッツ一掴み',    150, '🥜', false, '{"category":"healthy"}'),
('meal_snack', 'プロテインバー',  200, '💪', false, '{"category":"healthy"}'),

-- 晩酌（既存維持）
('meal_drinks', 'ビール1本',     200, '🍺', true, null),
('meal_drinks', 'ビール2本',     400, '🍺', true, null),
('meal_drinks', 'ハイボール1杯', 130, '🥃', true, null),
('meal_drinks', '日本酒1合',     190, '🍶', true, null),
('meal_drinks', 'ワイン1杯',     120, '🍷', true, null),

-- 運動（既存維持）
('exercise_weights', '筋トレ 30分',       200, '💪', false, null),
('exercise_weights', '筋トレ 60分',       350, '💪', false, null),
('exercise_weights', '筋トレ 90分',       450, '💪', false, null),
('exercise_cardio',  'ウォーキング 30分', 150, '🚶', false, null),
('exercise_cardio',  'ウォーキング 60分', 250, '🚶', false, null),
('exercise_cardio',  'ランニング 30分',   300, '🏃', false, null),
('exercise_cardio',  'ランニング 60分',   500, '🏃', false, null),
('exercise_sport',   'フットサル 90分',   600, '⚽', false, null),
('exercise_sport',   '水泳 60分',         500, '🏊', false, null),
('exercise_sport',   'テニス 90分',       550, '🎾', false, null);
