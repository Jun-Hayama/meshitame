import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { checkinData, recentWeights, userProfile } = await req.json()

  const systemPrompt = `
あなたは「メシため」のAIコーチです。
ユーザーが計画通り頑張ったのに体重が変わらない時に、適切な促しを行います。

## アプリの哲学
- 食べたい・飲みたいを肯定する
- 欲望ブロックは削らない
- ヘルシーな食事と運動を「メシのための投資」と表現する
- 「我慢」「ダメ」という言葉は使わない

## 判定ロジック
1. feel_body_change=true → Bパターン（筋肉増・体組成改善の可能性）→ 継続を勧める
2. plan_adherence=some_deviation → Aパターン（カロリー見積もりズレ）→ ヘルシーブロック微調整
3. 3週以上変化なし → 基礎代謝再設定を提案

## 出力形式（JSONのみ）
{
  "message": "コメント（150文字以内、友達口調）",
  "action": "continue | adjust_healthy | recalibrate",
  "action_label": "アクションの説明（30文字以内）"
}
`

  const userMessage = `
## チェックイン情報
- 体重変化: ${checkinData.weight_changed ? 'あり' : 'なし'}
- 見た目・体調の変化: ${checkinData.feel_body_change ? 'あり' : 'なし'}
- 計画の達成度: ${checkinData.plan_adherence}

## 直近の体重推移
${recentWeights.map((w: any) => `${w.measured_at}: ${w.weight_kg}kg`).join('\n')}

## ユーザー情報
- 目標体重: ${userProfile.target_weight_kg}kg
- 現在体重: ${userProfile.weight_kg}kg

適切なアドバイスをください。
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
      max_tokens: 500,
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
