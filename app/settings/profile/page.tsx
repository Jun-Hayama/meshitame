'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { calcBaseMetabolism, calcTDEE } from '@/lib/calories'

type DrinkType = 'beer' | 'highball' | 'wine' | 'sake' | 'other'

const DRINK_TYPES: {
  value: DrinkType
  label: string
  emoji: string
  calories: number | null
  unit: string
}[] = [
  { value: 'beer',     label: 'ビール',   emoji: '🍺', calories: 200, unit: '本' },
  { value: 'highball', label: 'ハイボール', emoji: '🥃', calories: 130, unit: '杯' },
  { value: 'wine',     label: 'ワイン',    emoji: '🍷', calories: 120, unit: '杯' },
  { value: 'sake',     label: '日本酒',   emoji: '🍶', calories: 190, unit: '合' },
  { value: 'other',    label: 'その他',   emoji: '🍸', calories: null, unit: '杯' },
]

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(true)

  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male')
  const [activityLevel, setActivityLevel] = useState<'low' | 'moderate' | 'high'>('moderate')
  const [drinkType, setDrinkType]             = useState<DrinkType>('beer')
  const [drinksPerDay, setDrinksPerDay]       = useState(1)
  const [drinksOtherCalories, setDrinksOtherCalories] = useState(200)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (profile) {
        setIsNew(false)
        setHeight(String(profile.height_cm ?? ''))
        setWeight(String(profile.weight_kg ?? ''))
        setTargetWeight(String(profile.target_weight_kg ?? ''))
        setAge(String(profile.age ?? ''))
        setSex(profile.sex ?? 'male')
        setActivityLevel(profile.activity_level ?? 'moderate')
        setDrinkType((profile.drink_type as DrinkType) ?? 'beer')
        setDrinksPerDay(profile.drinks_per_day ?? 1)
        if (profile.drink_type === 'other') {
          setDrinksOtherCalories(profile.drinks_calories_per_unit ?? 200)
        }
      }
      setLoading(false)
    })
  }, [router])

  async function handleSave() {
    setError(null)
    const h = parseFloat(height)
    const w = parseFloat(weight)
    const tw = parseFloat(targetWeight)
    const a = parseInt(age)

    if (!h || !w || !tw || !a) {
      setError('すべての項目を入力してください')
      return
    }
    if (h < 100 || h > 250) { setError('身長は100〜250cmで入力してください'); return }
    if (w < 30 || w > 300) { setError('体重は30〜300kgで入力してください'); return }
    if (tw < 30 || tw > 300) { setError('目標体重は30〜300kgで入力してください'); return }
    if (a < 10 || a > 120) { setError('年齢は10〜120で入力してください'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const bmr = calcBaseMetabolism(w, h, a, sex)
    const baseCalories = calcTDEE(bmr, activityLevel)

    const selectedDrink = DRINK_TYPES.find(d => d.value === drinkType)!
    const drinkCalsPerUnit = drinkType === 'other'
      ? drinksOtherCalories
      : (selectedDrink.calories ?? 200)

    const profileData = {
      id: user.id,
      height_cm: h,
      weight_kg: w,
      target_weight_kg: tw,
      age: a,
      sex,
      activity_level: activityLevel,
      base_calories: baseCalories,
      drinks_per_day: drinksPerDay,
      drink_type: drinkType,
      drinks_calories_per_unit: drinkCalsPerUnit,
    }

    const { error: dbError } = isNew
      ? await supabase.from('user_profiles').insert(profileData)
      : await supabase.from('user_profiles').update(profileData).eq('id', user.id)

    setSaving(false)

    if (dbError) {
      setError('保存に失敗しました: ' + dbError.message)
      return
    }

    router.replace('/')
  }

  async function handleSkip() {
    router.replace('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  const bmrPreview = height && weight && age
    ? calcBaseMetabolism(parseFloat(weight), parseFloat(height), parseInt(age), sex)
    : null
  const tdeePreview = bmrPreview
    ? calcTDEE(bmrPreview, activityLevel)
    : null

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-12">
      <div className="max-w-md mx-auto">
        <header className="px-5 pt-12 pb-6">
          {!isNew && (
            <button onClick={() => router.back()} className="text-stone-500 text-xl mb-4 block">←</button>
          )}
          <h1 className="text-2xl font-bold">
            {isNew ? '👤 プロフィール設定' : '⚙️ プロフィール編集'}
          </h1>
          {isNew && (
            <p className="text-stone-500 text-sm mt-2">
              カロリー目標を計算するために使います
            </p>
          )}
        </header>

        <main className="px-5 space-y-5">
          {/* 身長 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">身長（cm）</label>
            <input
              type="number"
              value={height}
              onChange={e => setHeight(e.target.value)}
              placeholder="170"
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* 体重 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">体重（kg）</label>
            <input
              type="number"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="65"
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* 目標体重 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">目標体重（kg）</label>
            <input
              type="number"
              value={targetWeight}
              onChange={e => setTargetWeight(e.target.value)}
              placeholder="60"
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* 年齢 */}
          <div>
            <label className="text-stone-500 text-xs mb-1.5 block">年齢</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              placeholder="30"
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
            />
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
                    sex === opt.value
                      ? 'bg-amber-400 text-stone-950'
                      : 'bg-stone-900 text-stone-400'
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all ${
                    activityLevel === opt.value
                      ? 'bg-amber-400/20 border border-amber-400/50'
                      : 'bg-stone-900'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${activityLevel === opt.value ? 'text-amber-400' : 'text-stone-200'}`}>
                      {opt.label}
                    </p>
                    <p className="text-stone-500 text-xs mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 晩酌の設定 */}
          {(() => {
            const selDrink = DRINK_TYPES.find(d => d.value === drinkType)!
            const calsPerUnit = drinkType === 'other' ? drinksOtherCalories : (selDrink.calories ?? 200)
            const dailyCals   = calsPerUnit * drinksPerDay
            const weeklyCals  = dailyCals * 7
            return (
              <div>
                <label className="text-stone-500 text-xs mb-3 block">🍺 晩酌の設定</label>

                {/* お酒の種類 */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {DRINK_TYPES.map(dt => (
                    <button
                      key={dt.value}
                      onClick={() => setDrinkType(dt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm transition-all ${
                        drinkType === dt.value
                          ? 'bg-amber-400/20 border border-amber-400/50 text-amber-400'
                          : 'bg-stone-900 text-stone-400'
                      }`}
                    >
                      <span>{dt.emoji}</span>
                      <span className="font-medium">{dt.label}</span>
                      {dt.calories !== null && (
                        <span className="ml-auto text-[10px] text-stone-500">{dt.calories}kcal</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* その他カロリー手入力 */}
                {drinkType === 'other' && (
                  <div className="mb-3">
                    <input
                      type="number"
                      value={drinksOtherCalories}
                      onChange={e => setDrinksOtherCalories(Number(e.target.value))}
                      placeholder="200"
                      className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
                    />
                    <p className="text-stone-600 text-[10px] mt-1 px-1">1杯あたりのカロリーを入力</p>
                  </div>
                )}

                {/* 1日あたりの量 */}
                <div className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3 mb-3">
                  <span className="text-stone-400 text-sm">1日あたりの量</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setDrinksPerDay(p => Math.max(0, p - 1))}
                      className="w-8 h-8 flex items-center justify-center bg-stone-800 text-stone-300 rounded-xl font-bold text-lg"
                    >
                      −
                    </button>
                    <span className="text-stone-100 font-bold w-6 text-center tabular-nums">{drinksPerDay}</span>
                    <button
                      onClick={() => setDrinksPerDay(p => Math.min(10, p + 1))}
                      className="w-8 h-8 flex items-center justify-center bg-stone-800 text-stone-300 rounded-xl font-bold text-lg"
                    >
                      ＋
                    </button>
                    <span className="text-stone-500 text-sm">{selDrink.unit}</span>
                  </div>
                </div>

                {/* リアルタイム表示 */}
                <div className={`rounded-2xl px-4 py-2.5 ${
                  drinksPerDay > 0
                    ? 'bg-amber-400/10 border border-amber-400/20'
                    : 'bg-stone-900'
                }`}>
                  <p className={`text-sm ${drinksPerDay > 0 ? 'text-amber-400' : 'text-stone-500'}`}>
                    {drinksPerDay > 0
                      ? `1日 ${dailyCals.toLocaleString()}kcal・週 ${weeklyCals.toLocaleString()}kcal 分です`
                      : '晩酌なし'}
                  </p>
                </div>
              </div>
            )
          })()}

          {/* カロリープレビュー */}
          {tdeePreview && (
            <div className="bg-stone-900 rounded-2xl px-4 py-3">
              <p className="text-stone-500 text-xs mb-1">計算された1日の目標カロリー</p>
              <p className="text-amber-400 font-bold text-2xl">{tdeePreview} <span className="text-stone-500 text-sm font-normal">kcal</span></p>
              <p className="text-stone-600 text-xs mt-0.5">ハリス・ベネディクト式による計算</p>
            </div>
          )}

          {error && (
            <p className="text-rose-400 text-sm px-1">{error}</p>
          )}

          {/* 保存ボタン */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存してはじめる'}
          </button>

          {/* スキップボタン */}
          {isNew && (
            <button
              onClick={handleSkip}
              className="w-full text-stone-600 text-sm py-2"
            >
              あとで設定する（スキップ）
            </button>
          )}
        </main>
      </div>
    </div>
  )
}
