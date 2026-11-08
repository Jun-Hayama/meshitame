'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  calcBaseMetabolism,
  calcTDEE,
  checkLossLimit,
  calcGates,
  calcCurrentMonthTargets,
  estimateMonthsToTarget,
  formatDateJST,
} from '@/lib/calories'
import type { GoalPlanRow } from '@/types'

type Sex = 'male' | 'female' | 'other'
type ActivityLevel = 'low' | 'moderate' | 'high'

const PERIOD_OPTIONS = [3, 6, 9, 12, 15, 18, 24]

const inputClass =
  'w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50'

// 入力が揃って範囲内なら数値を返す。そうでなければエラーメッセージ
function parseInputs(height: string, weight: string, targetWeight: string, age: string) {
  const h = parseFloat(height)
  const w = parseFloat(weight)
  const tw = parseFloat(targetWeight)
  const a = parseInt(age)
  if (!h || !w || !tw || !a) return { error: null }
  if (h < 100 || h > 250) return { error: '身長は100〜250cmで入力してください' }
  if (w < 30 || w > 300) return { error: '体重は30〜300kgで入力してください' }
  if (tw < 30 || tw > 300) return { error: '目標体重は30〜300kgで入力してください' }
  if (a < 10 || a > 120) return { error: '年齢は10〜120で入力してください' }
  if (tw >= w) return { error: '目標体重は今の体重より小さい値にしてください' }
  return { error: null, values: { h, w, tw, a } }
}

// 計算はすべて lib/calories.ts の関数で行う
function calcGoal(
  { h, w, tw, a }: { h: number; w: number; tw: number; a: number },
  sex: Sex,
  activityLevel: ActivityLevel,
  periodMonths: number
) {
  const now = new Date()
  const startDate = formatDateJST(now)
  const bmr = calcBaseMetabolism(w, h, a, sex)
  const tdee = calcTDEE(bmr, activityLevel)
  const limit = checkLossLimit({
    heightCm: h,
    currentWeightKg: w,
    targetWeightKg: tw,
    periodMonths,
  })
  const gatePlan = calcGates(w, limit.targetLossKg, periodMonths)
  const { dailySaving, dailyIntakeKcal: dailyIntake } = calcCurrentMonthTargets(
    { start_date: startDate, period_months: periodMonths, gates: gatePlan.gates, tdee, bmr },
    now
  )
  const monthsAtCap = dailySaving.capped
    ? estimateMonthsToTarget(limit.targetLossKg, dailySaving.savingKcal)
    : null
  return { startDate, bmr, tdee, limit, gatePlan, dailySaving, dailyIntake, monthsAtCap }
}

export default function SetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [periodMonths, setPeriodMonths] = useState(12)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }

      // 有効な目標があればそれを、なければプロフィールを初期値にする
      const { data: plan } = await supabase
        .from('goal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle<GoalPlanRow>()

      if (plan) {
        setHeight(String(plan.height_cm))
        setWeight(String(plan.start_weight_kg))
        setTargetWeight(String(plan.target_weight_kg))
        setAge(String(plan.age))
        setSex(plan.sex)
        setActivityLevel(plan.activity_level)
        setPeriodMonths(plan.period_months)
      } else {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        if (profile) {
          setHeight(String(profile.height_cm ?? ''))
          setWeight(String(profile.weight_kg ?? ''))
          setTargetWeight(String(profile.target_weight_kg ?? ''))
          setAge(String(profile.age ?? ''))
          setSex(profile.sex ?? 'male')
          setActivityLevel(profile.activity_level ?? 'moderate')
        }
      }
      setLoading(false)
    })
  }, [router])

  const parsed = parseInputs(height, weight, targetWeight, age)

  const result = parsed.values
    ? calcGoal(parsed.values, sex, activityLevel, periodMonths)
    : null

  const periodOptions = PERIOD_OPTIONS.includes(periodMonths)
    ? PERIOD_OPTIONS
    : [...PERIOD_OPTIONS, periodMonths].sort((a, b) => a - b)

  async function handleSave() {
    if (!result || !parsed.values || !result.limit.withinLimit) return
    setSaveError(null)
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { h, w, tw, a } = parsed.values
    // user_profiles の更新・古い目標の無効化・新しい目標の挿入を1トランザクションで行う
    const { error } = await supabase.rpc('save_goal_plan', {
      p_start_date: result.startDate,
      p_height_cm: h,
      p_start_weight_kg: w,
      p_target_weight_kg: tw,
      p_age: a,
      p_sex: sex,
      p_activity_level: activityLevel,
      p_period_months: periodMonths,
      p_bmr: result.bmr,
      p_tdee: result.tdee,
      p_target_loss_kg: result.limit.targetLossKg,
      p_gates: result.gatePlan.gates,
    })

    setSaving(false)
    if (error) {
      setSaveError('保存できませんでした。もう一度お試しください（' + error.message + '）')
      return
    }
    router.replace('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-12">
      <div className="max-w-md mx-auto">
        <header className="px-5 pt-12 pb-6">
          <button onClick={() => router.back()} className="text-stone-500 text-xl mb-4 block">←</button>
          <h1 className="text-2xl font-bold">🎯 目標を決めよう</h1>
          <p className="text-stone-500 text-sm mt-2">
            食べたいものを楽しみながら、無理なく届くペースを計算します
          </p>
        </header>

        <main className="px-5 space-y-5">
          {/* 体のこと */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-stone-500 text-xs mb-1.5 block">身長（cm）</label>
              <input type="number" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="170" className={inputClass} />
            </div>
            <div>
              <label className="text-stone-500 text-xs mb-1.5 block">年齢</label>
              <input type="number" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} placeholder="30" className={inputClass} />
            </div>
            <div>
              <label className="text-stone-500 text-xs mb-1.5 block">今の体重（kg）</label>
              <input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="70" className={inputClass} />
            </div>
            <div>
              <label className="text-stone-500 text-xs mb-1.5 block">目標体重（kg）</label>
              <input type="number" inputMode="decimal" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} placeholder="63" className={inputClass} />
            </div>
          </div>

          {/* 性別 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">性別</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'male', label: '男性' },
                { value: 'female', label: '女性' },
                { value: 'other', label: 'その他' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSex(opt.value)}
                  className={`py-2.5 rounded-2xl text-sm font-medium transition-all ${
                    sex === opt.value ? 'bg-amber-400 text-stone-950' : 'bg-stone-900 text-stone-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 活動量 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">活動量</label>
            <div className="space-y-2">
              {([
                { value: 'low', label: '低め', desc: 'デスクワーク中心、ほぼ運動なし' },
                { value: 'moderate', label: 'ふつう', desc: '週2〜3回の軽い運動あり' },
                { value: 'high', label: '高め', desc: '週4回以上の運動、体を動かす仕事' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setActivityLevel(opt.value)}
                  className={`w-full px-4 py-3 rounded-2xl text-left transition-all ${
                    activityLevel === opt.value ? 'bg-amber-400/20 border border-amber-400/50' : 'bg-stone-900'
                  }`}
                >
                  <p className={`text-sm font-medium ${activityLevel === opt.value ? 'text-amber-400' : 'text-stone-200'}`}>
                    {opt.label}
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 期間 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">期間（3ヶ月ごとにゲートがあります）</label>
            <div className="grid grid-cols-4 gap-2">
              {periodOptions.map(m => (
                <button
                  key={m}
                  onClick={() => setPeriodMonths(m)}
                  className={`py-2.5 rounded-2xl text-sm font-medium transition-all ${
                    periodMonths === m ? 'bg-amber-400 text-stone-950' : 'bg-stone-900 text-stone-400'
                  }`}
                >
                  {m}ヶ月
                </button>
              ))}
            </div>
          </div>

          {parsed.error && <p className="text-rose-400 text-sm px-1">{parsed.error}</p>}

          {result && (
            <>
              {/* 参考：BMI・標準体重 */}
              <div className="bg-stone-900 rounded-2xl px-4 py-3 flex justify-between text-sm">
                <div>
                  <p className="text-stone-500 text-xs">BMI（参考）</p>
                  <p className="text-stone-200 font-medium">{result.limit.bmi.toFixed(1)}</p>
                </div>
                <div className="text-right">
                  <p className="text-stone-500 text-xs">標準体重・BMI22（参考）</p>
                  <p className="text-stone-200 font-medium">{result.limit.standardWeightKg.toFixed(1)}kg</p>
                </div>
              </div>

              {/* ペースチェック */}
              {result.limit.withinLimit ? (
                <div className="bg-amber-400/10 border border-amber-400/20 rounded-2xl px-4 py-3">
                  <p className="text-amber-400 text-sm font-medium">
                    {periodMonths}ヶ月で −{result.limit.targetLossKg.toFixed(1)}kg は、無理のないペースです ✨
                  </p>
                </div>
              ) : (
                <div className="bg-stone-900 border border-amber-400/30 rounded-2xl px-4 py-3 space-y-2">
                  <p className="text-stone-200 text-sm">
                    {periodMonths}ヶ月だと少し急ぎ足のペースです（目安は −{result.limit.limitKg.toFixed(1)}kg まで）
                  </p>
                  {result.limit.suggestedPeriodMonths && (
                    <button
                      onClick={() => setPeriodMonths(result.limit.suggestedPeriodMonths!)}
                      className="w-full bg-amber-400 text-stone-950 text-sm font-bold py-2.5 rounded-2xl"
                    >
                      {result.limit.suggestedPeriodMonths}ヶ月にすると無理なく届きます →
                    </button>
                  )}
                </div>
              )}

              {result.limit.withinLimit && (
                <>
                  {/* ゲート */}
                  <div className="bg-stone-900 rounded-2xl px-4 py-3">
                    <p className="text-stone-500 text-xs mb-2">ゲート（3ヶ月ごと）</p>
                    <ul className="space-y-1.5">
                      {result.gatePlan.gates.map(g => (
                        <li key={g.index} className="flex justify-between text-sm">
                          <span className="text-stone-400">ゲート{g.index}（{g.endMonth}ヶ月目）</span>
                          <span className="text-stone-100 tabular-nums">
                            −{g.lossKg.toFixed(2)}kg → <span className="text-amber-400 font-medium">{g.targetWeightKg.toFixed(1)}kg</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 今月 */}
                  <div className="bg-stone-900 rounded-2xl px-4 py-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-stone-500 text-xs mb-1">今月の1日の貯金</p>
                      <p className="text-amber-400 font-bold text-2xl tabular-nums">
                        {result.dailySaving.savingKcal}<span className="text-stone-500 text-sm font-normal"> kcal</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-stone-500 text-xs mb-1">1日の目安</p>
                      <p className="text-amber-400 font-bold text-2xl tabular-nums">
                        {result.dailyIntake}<span className="text-stone-500 text-sm font-normal"> kcal</span>
                      </p>
                    </div>
                  </div>

                  {/* 1日の貯金が上限で止まるとき */}
                  {result.dailySaving.capped && (
                    <div className="bg-stone-900 border border-amber-400/30 rounded-2xl px-4 py-3 space-y-2">
                      <p className="text-stone-200 text-sm">
                        1日の貯金は {result.dailySaving.capKcal}kcal までにしています。
                        {result.monthsAtCap !== null &&
                          ` このペースだと −${result.limit.targetLossKg.toFixed(1)}kg まで約${result.monthsAtCap}ヶ月です`}
                      </p>
                      {result.monthsAtCap !== null && result.monthsAtCap > periodMonths && (
                        <button
                          onClick={() => setPeriodMonths(result.monthsAtCap!)}
                          className="w-full bg-amber-400 text-stone-950 text-sm font-bold py-2.5 rounded-2xl"
                        >
                          期間を{result.monthsAtCap}ヶ月にする →
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <p className="text-stone-500 text-xs px-1">
            🩺 持病などが気になる人は、医師に相談してくださいね
          </p>

          {saveError && <p className="text-rose-400 text-sm px-1">{saveError}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !result?.limit.withinLimit}
            className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl disabled:opacity-50"
          >
            {saving ? '保存中...' : 'この目標でスタート'}
          </button>
        </main>
      </div>
    </div>
  )
}
