import { NextRequest, NextResponse } from 'next/server'

// 空きスロットのみ生成。各ブロックは必須フィールドのみ。summaryは50文字以内。
const OUTPUT_SCHEMA = '{"summary":"50文字以内","blocks":[{"plan_date":"YYYY-MM-DD","block_type":"meal_morning|meal_lunch|meal_snack|meal_dinner|meal_drinks|exercise_weights|exercise_cardio|exercise_sport","name":"名前","calories":数値,"duration_min":null,"is_want":false,"is_flexible":true,"sort_order":0,"emoji":"絵文字"}]}'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const isAnchorFormat = 'anchorBlocks' in body

  let systemPrompt: string
  let userMessage: string

  if (isAnchorFormat) {
    const { anchorBlocks, skipSlots, userProfile, weekDates } = body

    systemPrompt = `週間食事・運動プランをJSONで返す。空きスロットのみ生成（アンカーは含めない）。1日最大6ブロック（朝昼おやつ夜晩酌運動）。TDEE±200kcal以内。ポジティブな日本語で。
JSON形式のみ（前後に説明文・コードブロック不要）: ${OUTPUT_SCHEMA}`

    const skipNote = skipSlots?.length > 0
      ? `\n食べないスロット（生成しない）: ${JSON.stringify(skipSlots)}`
      : ''

    const today = new Date().toISOString().split('T')[0]
    const futureDates = (weekDates as string[]).filter(d => d >= today)

    userMessage = `TDEE: ${userProfile.base_calories}kcal/日
日程（今日以降のみ）: ${futureDates.join(',')}
アンカー（生成済み・除外）: ${JSON.stringify(anchorBlocks)}${skipNote}

今日以降の空きスロットのみis_anchor:falseで補完してください。過去の日付のブロックは生成しないこと。`

  } else {
    // 旧形式（intention）
    const { intention, userProfile, weekDates } = body

    systemPrompt = `週間食事・運動プランをJSONで返す。欲望ブロック(is_want:true)は必ず実現。1日最大6ブロック。TDEE±200kcal以内。ポジティブな日本語で。
JSON形式のみ（前後に説明文・コードブロック不要）: ${OUTPUT_SCHEMA}`

    userMessage = `TDEE: ${userProfile.base_calories}kcal/日
欲望: ${JSON.stringify(intention.want_items)}
晩酌: ${intention.daily_drinks ? `${intention.daily_drinks_count}本/日 ${intention.daily_drinks_calories}kcal` : 'なし'}
おやつ: ${intention.allow_snacks ? `${intention.snack_calories_per_day}kcal/日` : 'なし'}
メモ: ${intention.schedule_notes || 'なし'}
日程: ${weekDates.join(',')}

7日間プランを作成してください。`
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'APIキーが設定されていません。' }, { status: 500 })
  }

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 25000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    clearTimeout(timeoutId)

    const data = await response.json()

    if (!response.ok) {
      const apiError = data?.error?.message ?? data?.error ?? JSON.stringify(data)
      console.error('[generate-plan] Anthropic API error', response.status, apiError)
      return NextResponse.json(
        { error: `Anthropic API ${response.status}: ${apiError}` },
        { status: 500 },
      )
    }

    const text = data.content?.[0]?.text || ''

    try {
      let jsonStr = text.replace(/```json|```/g, '').trim()

      // 途中で切れたJSONを修復する
      if (!jsonStr.endsWith('}')) {
        const lastBracket = jsonStr.lastIndexOf('}]')
        if (lastBracket > -1) {
          jsonStr = jsonStr.substring(0, lastBracket + 2) + '}'
        }
      }

      const parsed = JSON.parse(jsonStr)
      return NextResponse.json(parsed)
    } catch {
      console.error('[generate-plan] JSON parse failed. raw:', text)
      return NextResponse.json({ error: 'Parse failed', raw: text }, { status: 500 })
    }
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof Error && e.name === 'AbortError') {
      console.error('[generate-plan] Request timed out after 25s')
      return NextResponse.json({ error: 'timeout' }, { status: 408 })
    }
    console.error('[generate-plan] Fetch error:', e)
    return NextResponse.json({ error: `network error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
