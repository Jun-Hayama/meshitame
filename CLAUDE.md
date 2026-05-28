@AGENTS.md

# メシため（meshitame）

食べたいものだけ食べる。そのために逆算して一週間を設計する PWA。

## コンセプト・哲学

- 食べたい・飲みたいを全力で肯定する
- 「我慢」「禁止」「食べすぎ」という表現をアプリから排除する
- 欲望ブロック（is_want: true）は絶対に削除・変更しない
- ヘルシー食と運動は「ラーメンのための積み立て」として表現する
- AI応答は常にポジティブなトーンで

## プロジェクトの場所

- **Next.js アプリのルート**: このディレクトリ（`meshitame/`）
- `npm run dev` / `npm run build` はここで実行する
- 親ディレクトリ（`../`）にも `app/` や `schema.sql` のコピーがあるが、**編集対象は常にこのリポジトリ内のファイル**

## 技術スタック


| 項目      | 内容                                |
| ------- | --------------------------------- |
| フレームワーク | Next.js 16（App Router）            |
| UI      | React 19、Tailwind CSS 4           |
| 認証・DB   | Supabase（`@supabase/supabase-js`） |
| 言語      | TypeScript                        |


Next.js 16 の API・規約は学習データと異なる場合がある。`AGENTS.md` および `node_modules/next/dist/docs/` を参照すること。

## 環境変数（`.env.local`）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- シークレットをコミットしない
- DB スキーマはリポジトリ外の `../schema.sql` を Supabase SQL Editor で適用

## コマンド

```bash
npm run dev      # 開発サーバー http://localhost:3000
npm run build    # 本番ビルド
npm run start    # 本番起動
npm run lint     # ESLint
```

## ディレクトリ構成

```
app/
├── page.tsx                 # ホーム（今日のブロック・完了/スキップ）
├── layout.tsx               # ルートレイアウト
├── globals.css              # グローバルスタイル
├── login/page.tsx           # ログイン・新規登録
├── plan/
│   ├── page.tsx             # 週間カレンダー
│   └── new/page.tsx         # 欲望宣言 → AI プラン生成
├── weight/page.tsx          # 体重記録・チェックイン
├── log/deviation/page.tsx   # ズレ記録 → AI リプラン
└── api/
    ├── generate-plan/       # 週間プラン AI 生成
    ├── replan/              # ズレ後のリプラン
    └── ai-check/            # 体重変化なし時のチェックイン
lib/
├── supabase.ts              # Supabase クライアント
└── calories.ts              # 日付・週・カロリー計算
types/index.ts               # BlockType, PlanBlock 等
public/manifest.json         # PWA
```

## ドメイン概念

- **欲望ブロック**（`is_want: true`）: ユーザーが週初めに宣言した「食べたい・飲みたい」もの。AI プランでも削除・変更しない
- **ブロック種別**: 食事 `meal_`*、運動 `exercise_`*（`types/index.ts` の `BlockType`）
- **週プラン**: `week_plans` + `plan_blocks` + `weekly_intentions`
- **ズレ**: `deviations` に記録し、`/api/replan` で再計画

## 実装の慣習

### 認証

- クライアント: `lib/supabase.ts` の `supabase` を使用
- 未ログイン時は `/login` へ（例: `app/page.tsx`）
- 新規画面でも `supabase.auth.getUser()` でガードする

### UI

- ダークテーマ: `bg-stone-950`、`text-stone-100`
- アクセント: `text-amber-400` / `bg-amber-400`
- ユーザー向け文言は **日本語**
- ページは原則 `'use client'`（Supabase・ルーター利用のため）
- ボトムナビ: 今日 `/`、週プラン `/plan`、体重 `/weight`、設定 `/settings`（設定画面は未実装の場合あり）

### API Routes

- `app/api/*/route.ts` で POST 処理
- AI には JSON のみ返すようプロンプトで指示（`generate-plan` 等を参照）
- サーバー側で Anthropic 等を呼ぶ想定（キーは `.env.local`、クライアントに載せない）

### 変更時の注意

- 型は `types/index.ts` を更新し、DB と `schema.sql` の整合を保つ
- カロリー・週の開始日は `lib/calories.ts` を再利用する
- スコープは最小限。依頼されていないリファクタやドキュメント追加はしない
- コミットはユーザーが明示したときのみ

## 主要テーブル（Supabase）

`user_profiles`, `week_plans`, `weekly_intentions`, `plan_blocks`, `weight_logs`, `deviations`, `weight_checkins`, `block_templates`

RLS は `auth.uid() = user_id`（または profile の `id`）でユーザー本人のみ。

## 参照

- 製品・セットアップ概要: 親ディレクトリの `README.md`

