import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 空きスロットのみ生成。各ブロックは必須フィールドのみ。summaryは50文字以内。
const OUTPUT_SCHEMA = '{"summary":"50文字以内","blocks":[{"plan_date":"YYYY-MM-DD","block_type":"meal_morning|meal_lunch|meal_snack|meal_dinner|meal_drinks|exercise_weights|exercise_cardio|exercise_sport","name":"名前","calories":数値,"duration_min":null,"is_want":false,"is_flexible":true,"sort_order":0,"emoji":"絵文字"}]}'

// 今日の曜日から土曜までの残り日数（土曜含む）
// 日曜(0)=0, 月曜(1)=6, 水曜(3)=4, 土曜(6)=1
function calcRemainingDays(): number {
  const dayOfWeek = new Date().getDay()
  return dayOfWeek === 0 ? 0 : 7 - dayOfWeek
}

// メシポ初期値を計算する
// 差分0.5kg以上→360pt/週、0.5kg未満→180pt/週 を残り日数で按分
function calcInitialBuffer(weightKg: number, targetWeightKg: number): number {
  const diff = weightKg - targetWeightKg
  const basePt = diff >= 0.5 ? 360 : 180
  const remainingDays = calcRemainingDays()
  return Math.floor(basePt * remainingDays / 7)
}

async function upsertCalorieBuffer(
  weekPlanId: string,
  userId: string,
  totalBuffer: number,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return

  const supabase = createClient(supabaseUrl, supabaseKey)
  await supabase.from('calorie_buffers').upsert(
    {
      user_id: userId,
      week_plan_id: weekPlanId,
      total_buffer: totalBuffer,
      initial_buffer: totalBuffer,
      target_buffer: totalBuffer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'week_plan_id' },
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const isAnchorFormat = 'anchorBlocks' in body

  let systemPrompt: string
  let userMessage: string

  if (isAnchorFormat) {
    const { anchorBlocks, skipSlots, userProfile, weekDates } = body

    systemPrompt = `週間食事・運動プランをJSONで返す。空きスロットのみ生成（アンカーは含めない）。1日最大6ブロック（朝昼おやつ夜晩酌運動）。TDEE±200kcal以内。ポジティブな日本語で。
毎日必ず朝食（meal_morning）・昼食（meal_lunch）・夕食（meal_dinner）を含めること。欲望ブロックや晩酌がある日はそれも含める。スキップ指定がない限り昼食は省略しないこと。
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
毎日必ず朝食（meal_morning）・昼食（meal_lunch）・夕食（meal_dinner）を含めること。欲望ブロックや晩酌がある日はそれも含める。スキップ指定がない限り昼食は省略しないこと。
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

      // メシポ初期値の計算と保存
      const { weekPlanId, userProfile } = body
      if (
        weekPlanId &&
        userProfile?.id &&
        userProfile?.weight_kg != null &&
        userProfile?.target_weight_kg != null
      ) {
        const initialBuffer = calcInitialBuffer(
          userProfile.weight_kg as number,
          userProfile.target_weight_kg as number,
        )
        await upsertCalorieBuffer(weekPlanId as string, userProfile.id as string, initialBuffer)
        return NextResponse.json({ ...parsed, initialBuffer })
      }

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
