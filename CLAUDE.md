@AGENTS.md

# メシため（meshitame）

食べたいものを先に決めて、そのために貯めて、ちゃんと痩せていく PWA。 仕様の正本は `docs/v2-spec.md`。迷ったら仕様書を読み、仕様書と食い違うコードは仕様書に合わせる（10章は前の章より優先）。

## コンセプト・哲学

- 食べたい・飲みたいを全力で肯定する。チート（★）はアプリが勝手に削らない・動かさない
- 軽めの食事と運動は「チートのためにメシポを貯める」行動として表現する
- 「我慢」「禁止」「食べすぎ」は使わない。マイナス時も事実だけを伝え、責めない
- 細かく管理させない。毎日の記録は3秒で終わること
- 計算・判定はすべてロジック（決定的な純粋関数）。AIは相談機能だけに使う

## 主な仕組み（v2）

- **初回設定**（`/setup`）：身長・体重・目標・期間 → BMIで年間上限をチェック → 3ヶ月ごとのゲートに配分（12ヶ月は 35/30/20/15%）→ 今月の1日の貯金と目安カロリー
- **今日の目安**：朝・昼・夜の目安kcalだけ表示。「?」で目安くらい／がっつりのメニュー例（`lib/mealExamples.ts`）
- **毎日の記録**：各食事を 控えめ / 目安どおり / がっつり の3択。記録しない日は目安どおり扱い。7日前まで過去の日も記録できる
- **チート**（`/wants`、コード上は want）：アイテム（`lib/cheatItems.ts`）を数量つきで組み合わせて登録。置き換え（コスト = 合計 − その食事の目安）か上乗せ（コスト = 合計）
- **メシポゲージ**：月に1本。目標 = その月のチートのコスト合計、貯まったpt = 経過日数×150 ＋ 軽め×150 − がっつり×300 ＋ 運動pt。1pt = 1kcal
- **運動**：任意のアドオン。時間か歩数で入力し、月のプールに加算



## プロジェクトの場所

- **Next.js アプリのルート**: このディレクトリ（`meshitame/`）。`npm` コマンドはここで実行する
- 親ディレクトリ（`../`）にも `app/` や `schema.sql` のコピーがあるが、**編集対象は常にこのリポジトリ内のファイル**



## 技術スタック


| 項目      | 内容                                |
| ------- | --------------------------------- |
| フレームワーク | Next.js 16（App Router）            |
| UI      | React 19、Tailwind CSS 4           |
| 認証・DB   | Supabase（`@supabase/supabase-js`） |
| 言語      | TypeScript                        |
| テスト     | Vitest                            |


Next.js 16 の API・規約は学習データと異なる場合がある。`AGENTS.md` および `node_modules/next/dist/docs/` を参照すること。

## コマンド

```bash
npm run dev      # 開発サーバー http://localhost:3000
npm test         # Vitest（lib/calories.test.ts）
npm run build    # 本番ビルド
npm run lint     # ESLint
npx tsc --noEmit # 型チェック
```

報告の前に `npm test`・型チェック・`npm run build` を通すこと。

## ディレクトリ構成

```
app/
├── page.tsx              # ホーム（目安・3択記録・メシポゲージ・＋運動・＋チート・日付切り替え）
├── setup/page.tsx        # 初回設定（目標とゲート）
├── wants/page.tsx        # チートの月登録
├── weight/page.tsx       # 体重（v1のまま。フェーズ2で毎朝＋7日平均に作り直す）
├── settings/page.tsx     # 設定（目標設定への入口）
├── login/                # ログイン・パスワードリセット
├── plan/, plan/new/      # v1（週プラン・AIプラン生成）。触らない・拡張しない
├── settings/profile/     # v1のプロフィール設定。触らない
└── api/
    ├── generate-plan/    # v1のAIプラン生成。v2では使わない
    └── ai-check/         # 体重チェックイン相談（フェーズ3でv2向けに見直す）
components/
├── BottomNav.tsx         # 今日 / チート / 体重 / 設定
├── MealExamplesSheet.tsx
├── CheatItemPicker.tsx
└── ExerciseSheet.tsx
lib/
├── calories.ts           # v2の計算はすべてここ（純粋関数）
├── calorieConstants.ts   # 数値の初期値はすべてここ
├── calories.test.ts
├── cheatItems.ts         # チートアイテム表
├── mealExamples.ts       # メニュー例の表
└── supabase.ts
types/index.ts
docs/v2-spec.md           # 仕様書
migration_*.sql           # DB変更（Supabase SQL Editor で手動実行）
```



## 実装の慣習



### 計算

- 計算は `lib/calories.ts` に純粋関数で書き、テストを付ける。画面側で計算し直さない
- 数値は `lib/calorieConstants.ts` に定数として置く。マジックナンバーを画面に書かない
- 計算にAIを使わない
- 日付は日本時間の `YYYY-MM-DD` で扱う（`formatDateJST` を使う）。週は月曜始まり（`getWeekStart`）



### DB

- テーブルや列の変更は `migration_<内容>.sql` を新しく作る。`schema.sql` は直接変えない
- 新しいテーブルには RLS（`auth.uid() = user_id`）と `authenticated` への grant を必ず付ける
- 既存データを壊さない変更にする（列追加は null 可、制約の作り直しは既存値が通るか確認）
- 主要テーブル（v2）：`user_profiles`、`goal_plans`（有効は1人1行）、`monthly_wants`、`meal_logs`、`exercise_logs`、`custom_cheat_items`
- v1のテーブル（`week_plans`、`plan_blocks`、`weekly_intentions` など）はv2では使わない



### 認証

- クライアント: `lib/supabase.ts` の `supabase` を使用
- 新規画面でも `supabase.auth.getUser()` でガードし、未ログインは `/login` へ



### UI

- ダークテーマ: `bg-stone-950`、`text-stone-100`。アクセント: `amber-400`
- スマホファースト（`max-w-md`、ボトムナビ分の `pb-24`）
- ユーザー向け文言は日本語。画面上の呼び名は「チート」「メシポ」「メシポゲージ」（「欲望」「貯金ゲージ」は使わない）
- ページは原則 `'use client'`



### AI（相談機能のみ）

- サーバー側の API Route から呼ぶ。キーは `.env.local`、クライアントに載せない
- レスポンスは JSON のみで返すようプロンプトで指定する

