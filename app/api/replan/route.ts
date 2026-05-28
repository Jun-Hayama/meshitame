import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { deviation, remainingBlocks, userProfile } = await req.json()

  const systemPrompt = `
あなたは「メシため」のAIプランナーです。
ユーザーが予定からズレた時に、残りの週のプランを再調整します。

## 重要ルール
1. 欲望ブロック（is_want: true）は絶対に変更・削除しない
2. is_flexible: false のブロックも変更しない
3. カロリーオーバーの場合は、欲望ブロックを削らず運動ブロックを追加して吸収すること。運動ブロックの追加が難しい場合のみヘルシーブロックのカロリーを調整する。
4. ネガティブな表現を使わない

## 出力形式
JSON形式のみ（他のテキスト不要）：
{
  "message": "リプランのコメント（励ましのトーン、1〜2文）",
  "updated_blocks": [
    変更が必要な既存ブロックのみ（id必須, plan_date, block_type, name, calories, duration_min, sort_order, emoji）
  ],
  "added_blocks": [
    新たに追加する運動ブロック（plan_date, block_type, name, calories, duration_min, emoji）
  ],
  "exercise_note": "追加した運動の説明（例: 筋トレ45分を2日追加しました）または空文字"
}
`

  const userMessage = `
## ズレの内容
- タイプ: ${deviation.deviation_type}
- 説明: ${deviation.description || 'なし'}
- カロリー差分: ${deviation.calorie_delta > 0 ? '+' : ''}${deviation.calorie_delta} kcal

## 残りの週のブロック（変更可能なもの）
${JSON.stringify(remainingBlocks.filter((b: any) => b.is_flexible), null, 2)}

## ユーザーのTDEE
${userProfile.base_calories} kcal/日

カロリー差分を残りの日程で吸収するよう、柔軟なブロックを調整してください。
`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'APIキーが設定されていません。.env.localにANTHROPIC_API_KEYを追加してください。' }, { status: 500 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || ''

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Parse failed', raw: text }, { status: 500 })
  }
}
