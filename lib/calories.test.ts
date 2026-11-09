import { describe, it, expect } from 'vitest'
import {
  calcBaseMetabolism,
  calcTDEE,
  calcBMI,
  calcStandardWeight,
  getAnnualLossLimitRate,
  checkLossLimit,
  calcGates,
  calcMonthlyTarget,
  calcDailySaving,
  calcDailyIntakeTarget,
  estimateMonthsToTarget,
  calcCurrentMonthTargets,
  formatDateJST,
  calcRecoveryOptions,
  getDaysInMonth,
  calcMealSlotTargets,
  pickMealExamples,
  sumCheatItemsKcal,
  calcCheatCost,
  getDefaultCheatType,
  getCheatKind,
  buildCheatLabel,
  convertCheatCost,
  getMonthlyWantRowCost,
  sortCheatItemsByUsage,
  countFrequencyInMonth,
  expandCheatsForMonth,
  sumMonthCheatCosts,
  getReplacedMealKeys,
  calcMonthEarnedPt,
  calcMonthEarnedBreakdown,
  calcMeshipoGauge,
  calcDailyIntakeFromPace,
  calcPaceKgPerMonth,
  expandHeartyCheats,
  buildGaugeCheats,
  calcEarnedBreakdown,
  getWeekRange,
  getReviewWeek,
  calcWeekSummary,
  describeWeekEarned,
  calcExercisePoints,
  addDaysToDateStr,
  getRecordableDateRange,
  isRecordableDate,
  formatMonthDayWeekday,
  parseWeightInput,
  calcWeightAverage,
  calcWeekOverWeek,
  formatWeightChange,
  calcPlanMonthTargets,
  decideMonthTargets,
  getMonthStartAverageDate,
  getMonthTargetMode,
  monthTargetsToRow,
  monthTargetsFromRow,
  calcExtendedPeriodMonths,
  daysBetween,
  getPlanMonthEndDate,
  buildTargetLine,
  getTargetWeightOn,
  calcTargetGap,
  getChartRange,
  buildWeightChartData,
  detectNewMilestones,
  calcMealExampleKcal,
  buildMealExampleBreakdown,
  roundUpKcal,
  orderZeroCalCheats,
  calcZeroCalStatus,
  detectNewlyZeroed,
  describeZeroCalHeadline,
  buildGaugeMarkers,
  getGaugeCheatName,
  calcMonthWeightChange,
  describeMonthWeightChange,
} from '@/lib/calories'
import type { GaugeCheatEntry, MonthlyWantRow, WantEntry } from '@/types'
import { CHEAT_ITEMS } from '@/lib/cheatItems'
import { FOOD_ITEM_MAP } from '@/lib/foodItems'
import { MEAL_EXAMPLES } from '@/lib/mealExamples'

// 2026-11 は30日。2026-11-01 は日曜、2026-11-02 は月曜
const nov = (d: number) => new Date(2026, 10, d)

describe('仕様の例：178cm・104kg・1年で15kg', () => {
  const limit = checkLossLimit({
    heightCm: 178,
    currentWeightKg: 104,
    targetWeightKg: 89,
    periodMonths: 12,
  })

  it('BMI約32.8で、年15kg（約14%）は上限内', () => {
    expect(limit.bmi).toBeCloseTo(32.8, 1)
    expect(limit.annualLimitRate).toBe(0.15)
    expect(limit.limitKg).toBeCloseTo(15.6)
    expect(limit.targetLossKg / 104).toBeCloseTo(0.144, 3)
    expect(limit.withinLimit).toBe(true)
    expect(limit.suggestedPeriodMonths).toBeNull()
  })

  it('ゲートは −5.25 / −4.5 / −3.0 / −2.25kg', () => {
    const plan = calcGates(104, 15, 12)
    expect(plan.gates.map((g) => g.lossKg)).toEqual([
      expect.closeTo(5.25),
      expect.closeTo(4.5),
      expect.closeTo(3.0),
      expect.closeTo(2.25),
    ])
    expect(plan.gates.map((g) => g.endMonth)).toEqual([3, 6, 9, 12])
    expect(plan.gates[3].targetWeightKg).toBeCloseTo(89)
    // ゲート1の最低ライン 104 × 3% = 3.12kg を満たす
    expect(plan.gate1MinKg).toBeCloseTo(3.12)
    expect(plan.gate1MeetsMinimum).toBe(true)
  })

  it('ゲート1は月1.75kg、30日の月で1日の貯金420kcal', () => {
    const plan = calcGates(104, 15, 12)
    const monthlyKg = calcMonthlyTarget(plan.gates[0].lossKg)
    expect(monthlyKg).toBeCloseTo(1.75)

    // 40歳男性・活動ふつう：BMR 2109 / TDEE 3269 → 上限 min(750, 1010) = 750
    const bmr = calcBaseMetabolism(104, 178, 40, 'male')
    const tdee = calcTDEE(bmr, 'moderate')
    const saving = calcDailySaving(monthlyKg, 2026, 11, tdee, bmr)
    expect(getDaysInMonth(2026, 11)).toBe(30)
    expect(saving.savingKcal).toBe(420)
    expect(saving.capped).toBe(false)
    expect(calcDailyIntakeTarget(tdee, saving.savingKcal, bmr)).toBe(tdee - 420)
  })
})

describe('BMIと上限チェック', () => {
  it('標準体重はBMI22', () => {
    expect(calcStandardWeight(178)).toBeCloseTo(69.7, 1)
    expect(calcBMI(178, calcStandardWeight(178))).toBeCloseTo(22)
  })

  it('BMIの境界：25未満 / 25以上35未満 / 35以上', () => {
    expect(getAnnualLossLimitRate(24.99)).toBe(0.05)
    expect(getAnnualLossLimitRate(25)).toBe(0.15)
    expect(getAnnualLossLimitRate(34.99)).toBe(0.15)
    expect(getAnnualLossLimitRate(35)).toBe(0.2)
  })

  it('期間で上限を按分し、超える場合は3ヶ月単位で延長を提案', () => {
    // 104kg・BMI15% → 年15.6kg。6ヶ月なら7.8kgが上限
    const r = checkLossLimit({ heightCm: 178, currentWeightKg: 104, targetWeightKg: 89, periodMonths: 6 })
    expect(r.limitKg).toBeCloseTo(7.8)
    expect(r.withinLimit).toBe(false)
    expect(r.suggestedPeriodMonths).toBe(12)

    // 20kg なら 20 / 15.6 × 12 = 15.4ヶ月 → 18ヶ月
    const r2 = checkLossLimit({ heightCm: 178, currentWeightKg: 104, targetWeightKg: 84, periodMonths: 12 })
    expect(r2.suggestedPeriodMonths).toBe(18)
  })

  it('期間が3ヶ月単位でなければエラー', () => {
    expect(() =>
      checkLossLimit({ heightCm: 178, currentWeightKg: 104, targetWeightKg: 89, periodMonths: 4 })
    ).toThrow()
  })
})

describe('ゲート配分', () => {
  it('12ヶ月以外は均等配分', () => {
    const plan = calcGates(104, 6, 6)
    expect(plan.gates).toHaveLength(2)
    expect(plan.gates.map((g) => g.lossKg)).toEqual([expect.closeTo(3), expect.closeTo(3)])
  })

  it('ゲート1が現体重の3%に届かなければフラグを立てる', () => {
    // 104kg で年5kg → ゲート1 1.75kg < 3.12kg
    expect(calcGates(104, 5, 12).gate1MeetsMinimum).toBe(false)
  })
})

describe('1日の貯金の上限', () => {
  it('750kcalで頭打ち', () => {
    // 月4kg × 7200 ÷ 30 = 960
    const r = calcDailySaving(4, 2026, 11, 3500, 2000)
    expect(r).toEqual({ savingKcal: 750, uncappedKcal: 960, capKcal: 750, capped: true })
  })

  it('TDEE − 基礎代謝 で頭打ち（目安が基礎代謝を下回らない。12-3で −150 は廃止）', () => {
    // 活動少なめ：BMR 2109 / TDEE 2531 → 上限 422。月2kg = 480kcal/日 で上限に当たる
    const bmr = calcBaseMetabolism(104, 178, 40, 'male')
    const tdee = calcTDEE(bmr, 'low')
    const r = calcDailySaving(2, 2026, 11, tdee, bmr)
    expect(r.capKcal).toBe(tdee - bmr)
    expect(r.savingKcal).toBe(r.capKcal)
    expect(r.capped).toBe(true)
    expect(calcDailyIntakeTarget(tdee, r.savingKcal, bmr)).toBe(bmr)
  })

  it('TDEE = 基礎代謝なら貯金0', () => {
    expect(calcDailySaving(1, 2026, 11, 2000, 2000).savingKcal).toBe(0)
  })

  it('31日の月は日割りが小さくなる', () => {
    expect(calcDailySaving(1.75, 2026, 12, 3500, 2000).savingKcal).toBe(406)
  })
})

describe('マイナス時の解消方法', () => {
  const wants: WantEntry[] = [{ id: 'ramen', kind: 'ramen', date: '2026-11-06' }]

  it('運動・軽め・欲望を通常の食事に、を数字つきで返す', () => {
    expect(calcRecoveryOptions(300, wants)).toEqual([
      { type: 'exercise', exercise: 'walking_30min', count: 2, points: 300 },
      { type: 'light_meals', count: 2, points: 300 },
      { type: 'swap_want', wantId: 'ramen', kind: 'ramen', points: 500 },
    ])
  })

  it('端数は切り上げ（600pt → 軽め4食）', () => {
    const options = calcRecoveryOptions(560, [])
    expect(options).toContainEqual({ type: 'light_meals', count: 4, points: 600 })
  })

  it('マイナスでなければ選択肢なし', () => {
    expect(calcRecoveryOptions(0, wants)).toEqual([])
  })
})

describe('目標までの期間の目安', () => {
  it('上限750kcal/日で15kg → 約4.75ヶ月 → 3ヶ月単位で6ヶ月', () => {
    // 750 × 30.4 ÷ 7200 = 3.1666kg/月 → 15 ÷ 3.1666 = 4.74ヶ月
    expect(estimateMonthsToTarget(15, 750)).toBe(6)
  })

  it('ちょうど割り切れるときは切り上げない', () => {
    // 1ヶ月 = 600 × 30.4 ÷ 7200 = 2.5333kg → 3ヶ月で 7.6kg
    expect(estimateMonthsToTarget(7.6, 600)).toBe(3)
  })

  it('少しでも超えたら次の3ヶ月へ', () => {
    expect(estimateMonthsToTarget(7.7, 600)).toBe(6)
  })

  it('貯金が0以下なら届かないので null', () => {
    expect(estimateMonthsToTarget(5, 0)).toBeNull()
    expect(estimateMonthsToTarget(5, -100)).toBeNull()
  })

  it('目標が0kg以下なら0ヶ月', () => {
    expect(estimateMonthsToTarget(0, 500)).toBe(0)
  })
})

describe('基礎代謝：性別その他', () => {
  it('男性式と女性式の平均を四捨五入', () => {
    // 男性 2108.792、女性 1787.525 → 平均 1948.1585
    expect(calcBaseMetabolism(104, 178, 40, 'male')).toBe(2109)
    expect(calcBaseMetabolism(104, 178, 40, 'female')).toBe(1788)
    expect(calcBaseMetabolism(104, 178, 40, 'other')).toBe(1948)
  })
})

describe('今月の1日の貯金・目安', () => {
  // 104kg・12ヶ月で15kg → ゲート 5.25 / 4.5 / 3.0 / 2.25kg
  const plan = {
    start_date: '2026-11-08',
    period_months: 12,
    gates: calcGates(104, 15, 12).gates,
    tdee: 3000,
    bmr: 2000,
  }

  it('開始月：ゲート1 ÷ 3 = 1.75kg、11月は30日', () => {
    const t = calcCurrentMonthTargets(plan, nov(20))
    expect(t.monthNumber).toBe(1)
    expect(t.gateIndex).toBe(1)
    expect(t.finished).toBe(false)
    expect(t.monthlyTargetKg).toBeCloseTo(1.75)
    expect(t.dailySaving.savingKcal).toBe(420) // 1.75 × 7200 ÷ 30
    expect(t.dailyIntakeKcal).toBe(2580)
  })

  it('2ヶ月目：ゲート1のまま、12月は31日', () => {
    const t = calcCurrentMonthTargets(plan, new Date(2026, 11, 15))
    expect(t.monthNumber).toBe(2)
    expect(t.gateIndex).toBe(1)
    expect(t.dailySaving.savingKcal).toBe(406) // 1.75 × 7200 ÷ 31 = 406.45
  })

  it('4ヶ月目：ゲート2（4.5kg ÷ 3）、2027年2月は28日', () => {
    const t = calcCurrentMonthTargets(plan, new Date(2027, 1, 10))
    expect(t.monthNumber).toBe(4)
    expect(t.gateIndex).toBe(2)
    expect(t.monthlyTargetKg).toBeCloseTo(1.5)
    expect(t.dailySaving.savingKcal).toBe(386) // 1.5 × 7200 ÷ 28 = 385.7
  })

  it('最終月（12ヶ月目）はゲート4', () => {
    const t = calcCurrentMonthTargets(plan, new Date(2027, 9, 31))
    expect(t.monthNumber).toBe(12)
    expect(t.gateIndex).toBe(4)
    expect(t.finished).toBe(false)
  })

  it('期間外：終了フラグ、貯金0でTDEEどおり', () => {
    const t = calcCurrentMonthTargets(plan, new Date(2027, 10, 1))
    expect(t.monthNumber).toBe(13)
    expect(t.finished).toBe(true)
    expect(t.gateIndex).toBeNull()
    expect(t.dailySaving.savingKcal).toBe(0)
    expect(t.dailyIntakeKcal).toBe(3000)
  })

  it('開始前の日付は1ヶ月目として扱う', () => {
    const t = calcCurrentMonthTargets(plan, new Date(2026, 9, 31))
    expect(t.monthNumber).toBe(1)
    expect(t.gateIndex).toBe(1)
  })

  it('月は日本時間で数える（UTC 11/30 16:00 = 日本時間 12/1）', () => {
    const t = calcCurrentMonthTargets(plan, new Date('2026-11-30T16:00:00Z'))
    expect(t.month).toBe(12)
    expect(t.monthNumber).toBe(2)
  })
})

describe('日本時間の日付', () => {
  it('UTC 15:00 以降は日本時間で翌日', () => {
    expect(formatDateJST(new Date('2026-11-07T14:59:00Z'))).toBe('2026-11-07')
    expect(formatDateJST(new Date('2026-11-07T15:00:00Z'))).toBe('2026-11-08')
  })
})

describe('朝・昼・夜の目安', () => {
  it('朝昼夜の合計は1日の目安そのまま（12-3で −150 は廃止）', () => {
    const slots = calcMealSlotTargets(2000)
    expect(slots.map((s) => s.slot)).toEqual(['morning', 'lunch', 'dinner'])
    expect(slots.reduce((sum, s) => sum + s.kcal, 0)).toBe(2000)
  })
})

describe('毎日の目安 = 必要量 − 減らすペース（12-3）', () => {
  it('必要量2150・ふつう → 目安1910。基礎代謝1950なら目安1950', () => {
    expect(calcDailyIntakeFromPace(2150, 1500, 'normal')).toBe(1910)
    expect(calcDailyIntakeFromPace(2150, 1950, 'normal')).toBe(1950)
  })

  it('キープ 0 / ゆっくり −120 / ふつう −240 / しっかり −480（月0/0.5/1/2kg）', () => {
    expect(['keep', 'slow', 'normal', 'hard'].map((p) => calcDailyIntakeFromPace(2150, 1500, p as 'keep'))).toEqual([
      2150, 2030, 1910, 1670,
    ])
    expect(['slow', 'normal', 'hard'].map((p) => calcPaceKgPerMonth(p as 'slow'))).toEqual([0.5, 1, 2])
  })
})

describe('目安くらいの例・がっつりの例（10-2）', () => {
  it('目安くらいは目安の±15%、がっつりは目安+300以上だけ。どちらも近い順', () => {
    for (const t of calcMealSlotTargets(2300)) {
      const { normal, hearty } = pickMealExamples(t.slot, t.kcal)
      for (const m of normal) expect(Math.abs(m.kcal - t.kcal)).toBeLessThanOrEqual(t.kcal * 0.15)
      for (const m of hearty) expect(m.kcal).toBeGreaterThanOrEqual(t.kcal + 300)
      const dist = normal.map((m) => Math.abs(m.kcal - t.kcal))
      expect(dist).toEqual([...dist].sort((a, b) => a - b))
      const hk = hearty.map((m) => m.kcal)
      expect(hk).toEqual([...hk].sort((a, b) => a - b))
    }
  })

  it('がっつりは目安+300を50kcal単位で切り上げた値以上だけ（境界）', () => {
    // 目安 750 → 750 + 300 = 1050。kcal は辞書から：ご飯250、ご飯（大盛り）400
    const menu = [
      { name: 'a', genre: 'gaishoku' as const, slots: ['dinner' as const], items: [{ id: 'rice' as const, qty: 4 }] },
      { name: 'b', genre: 'gaishoku' as const, slots: ['dinner' as const], items: [{ id: 'rice_large' as const, qty: 2 }, { id: 'rice' as const, qty: 1 }] },
    ]
    // a = 1000、b = 1050
    const r = pickMealExamples('dinner', 750, menu)
    expect(r.heartyMinKcal).toBe(1050)
    expect(r.hearty.map((m) => m.name)).toEqual(['b'])
    // 目安 749 → 1049 → 表示も絞り込みも 1050
    expect(pickMealExamples('dinner', 749, menu).heartyMinKcal).toBe(1050)
    expect(pickMealExamples('dinner', 749, menu).hearty.map((m) => m.name)).toEqual(['b'])
  })

  it('その食事のメニューだけを出す', () => {
    const { normal, hearty } = pickMealExamples('morning', 450)
    for (const m of [...normal, ...hearty]) expect(m.slots).toContain('morning')
  })

  it('例の kcal は辞書から計算する（表示の kcal = 内訳の合計）', () => {
    const { normal } = pickMealExamples('lunch', 700)
    for (const m of normal) {
      expect(m.kcal).toBe(calcMealExampleKcal(m.items))
      expect(buildMealExampleBreakdown(m.items).reduce((sum, r) => sum + r.kcal, 0)).toBe(m.kcal)
    }
  })

  it('ジャンルが混ざる（同じジャンルばかりにならない）', () => {
    const { normal } = pickMealExamples('lunch', 700)
    expect(new Set(normal.map((m) => m.genre)).size).toBeGreaterThanOrEqual(3)
  })

  it('1日の目安1300〜3300kcalのどこでも、両方3〜8個出る', () => {
    for (let d = 1300; d <= 3300; d += 25) {
      for (const t of calcMealSlotTargets(d)) {
        const { normal, hearty } = pickMealExamples(t.slot, t.kcal)
        expect(normal.length, `${d} ${t.slot} 目安くらい`).toBeGreaterThanOrEqual(3)
        expect(hearty.length, `${d} ${t.slot} がっつり`).toBeGreaterThanOrEqual(3)
        expect(normal.length).toBeLessThanOrEqual(8)
        expect(hearty.length).toBeLessThanOrEqual(8)
      }
    }
  })
})

describe('チートを細かく登録する（10-3）', () => {
  const item = (genre: string, name: string) => {
    const found = CHEAT_ITEMS.find((i) => i.genre === genre && i.name === name)
    if (!found) throw new Error(`no item ${genre}/${name}`)
    return found
  }
  const iekei = { ...item('ramen', '家系'), qty: 1 }
  const rice = { ...item('ramen', 'ライス'), qty: 1 }
  const beer = { ...item('alcohol', 'ビール500ml'), qty: 2 }
  const karaage = { ...item('snack_food', '唐揚げ'), qty: 1 }

  it('家系ラーメン＋ライスを、目安1083kcalの夜の代わりにする → コスト 117pt', () => {
    const total = sumCheatItemsKcal([iekei, rice])
    expect(total).toBe(1200)
    expect(calcCheatCost('replace', total, 1083)).toBe(117)
  })

  it('ビール500ml×2＋唐揚げを上乗せ → コスト 750pt', () => {
    const total = sumCheatItemsKcal([beer, karaage])
    expect(calcCheatCost('addon', total, 1083)).toBe(750)
  })

  it('置き換えで目安より少ないときはコスト0', () => {
    expect(calcCheatCost('replace', 300, 1083)).toBe(0)
  })

  it('初期タイプと kind は最初に選んだアイテムのジャンルから', () => {
    expect(getDefaultCheatType([iekei, beer])).toBe('replace')
    expect(getDefaultCheatType([beer, iekei])).toBe('addon')
    expect(getDefaultCheatType([])).toBe('replace')
    expect(getCheatKind([iekei])).toBe('ramen')
    expect(getCheatKind([beer])).toBe('evening_drink')
    expect(getCheatKind([{ genre: 'cake' }])).toBe('other')
  })

  it('名前は数量つきでつなぐ', () => {
    expect(buildCheatLabel([beer, karaage])).toBe('ビール500ml×2＋唐揚げ')
  })

  it('換算：750pt = ためメシ5回 or ウォーキング150分', () => {
    expect(convertCheatCost(750)).toEqual({ tamemeshi: 5, walkingMinutes: 150 })
    expect(convertCheatCost(117)).toEqual({ tamemeshi: 1, walkingMinutes: 24 })
  })

  it('登録済みの行：中身なしは WANT_COSTS、中身ありは置き換えの食事の目安で計算', () => {
    const slots = [
      { slot: 'morning' as const, kcal: 500 },
      { slot: 'lunch' as const, kcal: 700 },
      { slot: 'dinner' as const, kcal: 1083 },
    ]
    expect(
      getMonthlyWantRowCost({ kind: 'ramen', cheat_type: null, replace_slot: null, total_kcal: null }, slots)
    ).toBe(500)
    expect(
      getMonthlyWantRowCost({ kind: 'ramen', cheat_type: 'replace', replace_slot: 'dinner', total_kcal: 1200 }, slots)
    ).toBe(117)
    expect(
      getMonthlyWantRowCost({ kind: 'ramen', cheat_type: 'replace', replace_slot: 'lunch', total_kcal: 1200 }, slots)
    ).toBe(500)
    expect(
      getMonthlyWantRowCost({ kind: 'evening_drink', cheat_type: 'addon', replace_slot: null, total_kcal: 750 }, slots)
    ).toBe(750)
  })

  it('使った回数が多いアイテムを上に出す', () => {
    const items = [item('alcohol', 'ビール350ml'), item('alcohol', 'ビール500ml'), item('alcohol', 'ハイボール1杯')]
    const sorted = sortCheatItemsByUsage(items, [
      { items: [{ genre: 'alcohol', name: 'ハイボール1杯', qty: 3 }] },
      { items: [{ genre: 'alcohol', name: 'ハイボール1杯', qty: 1 }, { genre: 'alcohol', name: 'ビール500ml', qty: 1 }] },
      { items: null },
    ])
    expect(sorted.map((i) => i.name)).toEqual(['ハイボール1杯', 'ビール500ml', 'ビール350ml'])
  })
})

describe('メシポゲージは月で1本（10-4）', () => {
  // 2026-11 は30日
  const slots = [
    { slot: 'morning' as const, kcal: 500 },
    { slot: 'lunch' as const, kcal: 700 },
    { slot: 'dinner' as const, kcal: 1083 },
  ]
  const row = (over: Partial<MonthlyWantRow>): MonthlyWantRow => ({
    id: Math.random().toString(36).slice(2),
    user_id: 'u',
    kind: 'ramen',
    scheduled_date: null,
    times_per_week: null,
    label: null,
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
    cheat_type: null,
    replace_slot: null,
    items: null,
    total_kcal: null,
    ...over,
  })
  const ramen700 = (date: string) =>
    row({ scheduled_date: date, cheat_type: 'replace', replace_slot: 'dinner', total_kcal: 1783 })

  it('ラーメン700pt×月4回 → 目標2800。途中で晩酌500ptを追加 → 目標3300', () => {
    const rows = ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'].map(ramen700)
    const before = expandCheatsForMonth(rows, 2026, 11, slots, '2026-11-08')
    expect(before.map((e) => e.costPt)).toEqual([700, 700, 700, 700])
    expect(sumMonthCheatCosts(before)).toBe(2800)

    const banshaku = row({ kind: 'evening_drink', scheduled_date: '2026-11-08', cheat_type: 'addon', total_kcal: 500 })
    expect(sumMonthCheatCosts(expandCheatsForMonth([...rows, banshaku], 2026, 11, slots, '2026-11-08'))).toBe(3300)
  })

  it('頻度ベースは月に入る回数分を数える（週1回×30日の月 = 4回）', () => {
    expect(countFrequencyInMonth(1, 2026, 11)).toBe(4)
    expect(countFrequencyInMonth(3, 2026, 11)).toBe(13)
    const entries = expandCheatsForMonth(
      [row({ times_per_week: 1, cheat_type: 'replace', replace_slot: 'dinner', total_kcal: 1783 })],
      2026, 11, slots, '2026-11-08'
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].costPt).toBe(2800)
  })

  it('他の月・削除したものは入らない。今日より前の日付指定は済み', () => {
    const entries = expandCheatsForMonth(
      [ramen700('2026-10-31'), ramen700('2026-11-07'), ramen700('2026-11-08'), { ...ramen700('2026-11-09'), is_active: false }],
      2026, 11, slots, '2026-11-08'
    )
    expect(entries.map((e) => (e.mode === 'dated' ? [e.date, e.done] : null))).toEqual([
      ['2026-11-07', true],
      ['2026-11-08', false],
    ])
  })

  it('30日の月の10日目 → ペースの目印が目標×10/30', () => {
    const g = calcMeshipoGauge({ targetPt: 3300, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 })
    expect(g.pacePt).toBe(1100)
    expect(g.onPace).toBe(false)
    expect(g.behindPt).toBe(100)
    expect(g.catchUpWalkingMinutes).toBe(20)
    expect(calcMeshipoGauge({ targetPt: 3300, earnedPt: 1100, dayOfMonth: 10, daysInMonth: 30 }).onPace).toBe(true)
  })

  it('ためメシ3回＋ウォーキング30分 → 600pt（いつもの・がっつりは0pt）', () => {
    const input = {
      year: 2026, month: 11, today: '2026-11-10',
      mealLogs: [
        { log_date: '2026-11-02', slot: 'lunch' as const, choice: 'light' as const },
        { log_date: '2026-11-03', slot: 'morning' as const, choice: 'light' as const },
        { log_date: '2026-11-05', slot: 'dinner' as const, choice: 'light' as const },
        { log_date: '2026-11-04', slot: 'morning' as const, choice: 'normal' as const },
        { log_date: '2026-11-06', slot: 'dinner' as const, choice: 'hearty' as const },
      ],
      exerciseLogs: [{ log_date: '2026-11-07', points: calcExercisePoints({ type: 'walking', minutes: 30 }) }],
    }
    expect(calcMonthEarnedPt(input)).toBe(600)
    expect(calcMonthEarnedBreakdown(input)).toEqual({ tamemeshiCount: 3, tamemeshiPt: 450, exercisePt: 150, totalPt: 600 })
  })

  it('記録なしで30日経過 → 貯まった 0pt（自動の積み立てはしない）', () => {
    expect(calcMonthEarnedPt({ year: 2026, month: 11, today: '2026-11-30', mealLogs: [], exerciseLogs: [] })).toBe(0)
    expect(calcMonthEarnedPt({ year: 2026, month: 11, today: '2026-12-05', mealLogs: [], exerciseLogs: [] })).toBe(0)
  })

  it('運動ptはどの日の分も同じ月のプールに入る（他の月の分は入らない）', () => {
    const base = { year: 2026, month: 11, today: '2026-11-10', mealLogs: [] }
    const spread = calcMonthEarnedPt({
      ...base,
      exerciseLogs: [
        { log_date: '2026-11-01', points: 150 },
        { log_date: '2026-11-05', points: 300 },
        { log_date: '2026-11-10', points: 35 },
        { log_date: '2026-10-31', points: 999 },
      ],
    })
    const sameDay = calcMonthEarnedPt({ ...base, exerciseLogs: [{ log_date: '2026-11-10', points: 485 }] })
    expect(spread).toBe(485)
    expect(spread).toBe(sameDay)
  })

  it('夜を置き換えた日に夜の記録が「ためメシ」で残っていても、+150されない', () => {
    const cheat = ramen700('2026-11-03')
    const mealLogs = [{ log_date: '2026-11-03', slot: 'dinner' as const, choice: 'light' as const }]
    const base = { year: 2026, month: 11, today: '2026-11-10', mealLogs, exerciseLogs: [] }
    expect(calcMonthEarnedPt({ ...base, replacedMealKeys: getReplacedMealKeys([cheat]) })).toBe(0)
    // 置き換えのない食事（同じ日の昼）は数える
    const lunch = [...mealLogs, { log_date: '2026-11-03', slot: 'lunch' as const, choice: 'light' as const }]
    expect(calcMonthEarnedPt({ ...base, mealLogs: lunch, replacedMealKeys: getReplacedMealKeys([cheat]) })).toBe(150)
  })

  it('上乗せ・頻度ベースは置き換えの対象にしない', () => {
    expect(
      getReplacedMealKeys([
        row({ scheduled_date: '2026-11-03', cheat_type: 'addon', total_kcal: 500 }),
        row({ times_per_week: 1, cheat_type: 'replace', replace_slot: 'dinner', total_kcal: 1500 }),
      ]).size
    ).toBe(0)
  })

  it('貯まったptが目標を超えたら、超えた分が「追加でチートできる量」', () => {
    const g = calcMeshipoGauge({ targetPt: 1000, earnedPt: 1350, dayOfMonth: 10, daysInMonth: 30 })
    expect(g.extraPt).toBe(350)
    expect(calcMeshipoGauge({ targetPt: 1000, earnedPt: 900, dayOfMonth: 10, daysInMonth: 30 }).extraPt).toBe(0)
  })

  it('必要なためメシ = 切り上げ((目標 − 貯まった) ÷ 150)。0以下なら目標達成', () => {
    expect(calcMeshipoGauge({ targetPt: 1000, earnedPt: 400, dayOfMonth: 10, daysInMonth: 30 }).tamemeshiNeeded).toBe(4)
    expect(calcMeshipoGauge({ targetPt: 1000, earnedPt: 850, dayOfMonth: 10, daysInMonth: 30 }).tamemeshiNeeded).toBe(1)
    expect(calcMeshipoGauge({ targetPt: 1000, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 }).tamemeshiNeeded).toBe(0)
    expect(calcMeshipoGauge({ targetPt: 1000, earnedPt: 1300, dayOfMonth: 10, daysInMonth: 30 }).tamemeshiNeeded).toBe(0)
    // 目標0（チートなし）でも0回
    expect(calcMeshipoGauge({ targetPt: 0, earnedPt: 0, dayOfMonth: 1, daysInMonth: 30 }).tamemeshiNeeded).toBe(0)
  })
})

describe('がっつりはチートとして目標に足す（12-2）', () => {
  const slots = [
    { slot: 'morning' as const, kcal: 500 },
    { slot: 'lunch' as const, kcal: 700 },
    { slot: 'dinner' as const, kcal: 1083 },
  ]
  const ramen: MonthlyWantRow = {
    id: 'r1',
    user_id: 'u',
    kind: 'ramen',
    scheduled_date: '2026-11-06',
    times_per_week: null,
    label: null,
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
    cheat_type: 'replace',
    replace_slot: 'dinner',
    items: null,
    total_kcal: 1783, // 夜の目安1083の代わり → 700pt
  }
  const gaugeFor = (mealLogs: { log_date: string; slot: 'morning' | 'lunch' | 'dinner'; choice: 'light' | 'normal' | 'hearty' }[]) => {
    const replaced = getReplacedMealKeys([ramen])
    const cheats = buildGaugeCheats(expandCheatsForMonth([ramen], 2026, 11, slots, '2026-11-10'), mealLogs, 2026, 11, replaced)
    return {
      cheats,
      targetPt: sumMonthCheatCosts(cheats),
      earnedPt: calcMonthEarnedPt({ year: 2026, month: 11, today: '2026-11-10', mealLogs, exerciseLogs: [], replacedMealKeys: replaced }),
    }
  }

  it('がっつり1回 → 目標 +300、貯まったは変化なし。いつものに変えると目標が元に戻る', () => {
    const before = gaugeFor([])
    expect(before.targetPt).toBe(700)

    const hearty = gaugeFor([{ log_date: '2026-11-09', slot: 'dinner', choice: 'hearty' }])
    expect(hearty.targetPt).toBe(1000)
    expect(hearty.earnedPt).toBe(before.earnedPt)
    expect(hearty.cheats.at(-1)).toEqual({ mode: 'hearty', date: '2026-11-09', slot: 'dinner', costPt: 300 })

    const back = gaugeFor([{ log_date: '2026-11-09', slot: 'dinner', choice: 'normal' }])
    expect(back.targetPt).toBe(700)
    expect(back.earnedPt).toBe(before.earnedPt)
  })

  it('夜を置き換えたチートの日に夜のがっつり記録 → 目標は置き換えチートのコストだけ（+300されない）', () => {
    const g = gaugeFor([{ log_date: '2026-11-06', slot: 'dinner', choice: 'hearty' }])
    expect(g.targetPt).toBe(700)
    expect(g.cheats.filter((e) => e.mode === 'hearty')).toHaveLength(0)
    // 同じ日の昼のがっつりは数える
    expect(gaugeFor([{ log_date: '2026-11-06', slot: 'lunch', choice: 'hearty' }]).targetPt).toBe(1000)
  })

  it('がっつりは日付・食事の順に並び、範囲外の日は入らない', () => {
    const rows = expandHeartyCheats(
      [
        { log_date: '2026-11-09', slot: 'dinner', choice: 'hearty' },
        { log_date: '2026-11-09', slot: 'morning', choice: 'hearty' },
        { log_date: '2026-11-02', slot: 'lunch', choice: 'hearty' },
        { log_date: '2026-10-31', slot: 'lunch', choice: 'hearty' },
        { log_date: '2026-11-03', slot: 'lunch', choice: 'light' },
      ],
      '2026-11-01',
      '2026-11-30'
    )
    expect(rows.map((r) => `${r.date}:${r.slot}`)).toEqual(['2026-11-02:lunch', '2026-11-09:morning', '2026-11-09:dinner'])
  })
})

describe('週の振り返り（12-5）', () => {
  // 2026-11-09 は月曜、2026-11-15 は日曜。2026-11-30 は月曜（週は 11/30〜12/6）
  it('週は月曜〜日曜で区切る', () => {
    expect(getWeekRange('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(getWeekRange('2026-11-12')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(getWeekRange('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(getWeekRange('2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' })
  })

  it('月をまたぐ週（11/30〜12/6）・年をまたぐ週（12/28〜1/3）', () => {
    expect(getWeekRange('2026-12-03')).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    expect(getWeekRange('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
  })

  it('振り返りカードは日曜（その週）と次の月曜（前の週）だけ', () => {
    expect(getReviewWeek('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(getReviewWeek('2026-11-16')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(getReviewWeek('2026-11-14')).toBeNull()
    expect(getReviewWeek('2026-11-17')).toBeNull()
  })

  it('月をまたぐ週も日付で集計する（月のゲージとは別）', () => {
    const mealLogs = [
      { log_date: '2026-11-29', slot: 'lunch' as const, choice: 'light' as const }, // 前の週
      { log_date: '2026-11-30', slot: 'lunch' as const, choice: 'light' as const },
      { log_date: '2026-12-01', slot: 'dinner' as const, choice: 'light' as const },
      { log_date: '2026-12-02', slot: 'dinner' as const, choice: 'hearty' as const },
      { log_date: '2026-12-07', slot: 'dinner' as const, choice: 'light' as const }, // 次の週
    ]
    const exerciseLogs = [
      { log_date: '2026-11-30', points: 150 },
      { log_date: '2026-12-06', points: 150 },
    ]
    const banshaku: MonthlyWantRow = {
      id: 'b1', user_id: 'u', kind: 'evening_drink', scheduled_date: '2026-12-05', times_per_week: null,
      label: null, is_active: true, created_at: '2026-11-01T00:00:00Z',
      cheat_type: 'addon', replace_slot: null, items: null, total_kcal: 500,
    }
    const week = calcWeekSummary({
      from: '2026-11-30', mealLogs, exerciseLogs, wants: [banshaku], slotTargets: [], weightLogs: [],
    })
    expect(week.to).toBe('2026-12-06')
    expect(week.earned).toEqual({ tamemeshiCount: 2, tamemeshiPt: 300, exercisePt: 300, totalPt: 600 })
    expect(week.cheats.map((e) => (e.mode === 'hearty' ? `🔥${e.date}` : `★${e.date}`))).toEqual(['🔥2026-12-02', '★2026-12-05'])
    expect(week.cheatPt).toBe(800)
    expect(week.weightDiffKg).toBeNull()

    // 同じ記録でも月のゲージは月で区切る
    expect(calcEarnedBreakdown({ from: '2026-11-01', to: '2026-11-30', mealLogs, exerciseLogs }).totalPt).toBe(450)
  })

  it('体重の記録があれば前週との差（日曜の7日平均 − 前の日曜の7日平均）', () => {
    const weightLogs = [
      { measured_at: '2026-11-03', weight_kg: 100.4 },
      { measured_at: '2026-11-05', weight_kg: 100.2 },
      { measured_at: '2026-11-07', weight_kg: 100.0 },
      { measured_at: '2026-11-10', weight_kg: 99.9 },
      { measured_at: '2026-11-12', weight_kg: 99.7 },
      { measured_at: '2026-11-14', weight_kg: 99.5 },
    ]
    const week = calcWeekSummary({ from: '2026-11-09', mealLogs: [], exerciseLogs: [], wants: [], slotTargets: [], weightLogs })
    expect(week.weightDiffKg).toBeCloseTo(99.7 - 100.2)
  })

  it('言葉はポジティブに：600pt → ワイン1本ぶん', () => {
    expect(describeWeekEarned(600)).toBe('今週は+600pt！ワイン1本ぶん貯まりました🍷')
    expect(describeWeekEarned(150)).toBe('今週は+150pt！ビール1本ぶん貯まりました🍺')
    expect(describeWeekEarned(100)).toBe('今週は+100pt！コツコツ貯まっています')
    expect(describeWeekEarned(0)).not.toMatch(/[−-]\d/)
  })
})

describe('運動の記録（10-5）', () => {
  it('種類×時間：既存の値と一致（ウォーキング30分=150pt、ランニング30分=300pt、筋トレ60分=300pt）', () => {
    expect(calcExercisePoints({ type: 'walking', minutes: 30 })).toBe(150)
    expect(calcExercisePoints({ type: 'running', minutes: 30 })).toBe(300)
    expect(calcExercisePoints({ type: 'weights', minutes: 60 })).toBe(300)
    expect(calcExercisePoints({ type: 'cycling', minutes: 20 })).toBe(140)
    expect(calcExercisePoints({ type: 'sports', minutes: 60 })).toBe(420)
  })

  it('歩数：1000歩 = 35pt（端数は切り捨て）', () => {
    expect(calcExercisePoints({ type: 'steps', steps: 1000 })).toBe(35)
    expect(calcExercisePoints({ type: 'steps', steps: 8000 })).toBe(280)
    expect(calcExercisePoints({ type: 'steps', steps: 1500 })).toBe(52)
  })

  it('記録したptはその月のメシポに加算される', () => {
    const base = { year: 2026, month: 11, today: '2026-11-10', mealLogs: [] }
    const without = calcMonthEarnedPt({ ...base, exerciseLogs: [] })
    const withWalk = calcMonthEarnedPt({
      ...base,
      exerciseLogs: [{ log_date: '2026-11-10', points: calcExercisePoints({ type: 'walking', minutes: 30 }) }],
    })
    expect(withWalk - without).toBe(150)
  })
})

describe('過去の日の記録（10-7）', () => {
  it('今日・7日前はOK、8日前と明日はNG', () => {
    const today = '2026-11-08'
    expect(getRecordableDateRange(today)).toEqual({ min: '2026-11-01', max: '2026-11-08' })
    expect(isRecordableDate('2026-11-08', today)).toBe(true)
    expect(isRecordableDate('2026-11-01', today)).toBe(true)
    expect(isRecordableDate('2026-10-31', today)).toBe(false)
    expect(isRecordableDate('2026-11-09', today)).toBe(false)
  })

  it('月またぎ・年またぎ', () => {
    expect(getRecordableDateRange('2026-11-03')).toEqual({ min: '2026-10-27', max: '2026-11-03' })
    expect(isRecordableDate('2026-10-27', '2026-11-03')).toBe(true)
    expect(isRecordableDate('2026-10-26', '2026-11-03')).toBe(false)
    expect(addDaysToDateStr('2027-01-02', -7)).toBe('2026-12-26')
    expect(addDaysToDateStr('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToDateStr('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('「11/7（土）」の表記', () => {
    expect(formatMonthDayWeekday('2026-11-07')).toBe('11/7（土）')
    expect(formatMonthDayWeekday('2026-11-08')).toBe('11/8（日）')
  })

  it('過去の日の記録は、その日の月の集計に入る（前月の日は今月に入らない）', () => {
    const mealLogs = [
      { log_date: '2026-10-30', slot: 'dinner' as const, choice: 'light' as const },
      { log_date: '2026-11-01', slot: 'lunch' as const, choice: 'light' as const },
    ]
    const exerciseLogs = [{ log_date: '2026-10-31', points: 150 }]
    const nov = calcMonthEarnedPt({ year: 2026, month: 11, today: '2026-11-03', mealLogs, exerciseLogs })
    expect(nov).toBe(150)
    const oct = calcMonthEarnedPt({ year: 2026, month: 10, today: '2026-11-03', mealLogs, exerciseLogs })
    expect(oct).toBe(150 + 150)
  })
})

describe('parseWeightInput（11-1）', () => {
  it('0.1kg単位に丸める。カンマも小数点として読む', () => {
    expect(parseWeightInput('103.24')).toBe(103.2)
    expect(parseWeightInput(' 98,7 ')).toBe(98.7)
  })
  it('空・数字でない・範囲外は null', () => {
    expect(parseWeightInput('')).toBeNull()
    expect(parseWeightInput('abc')).toBeNull()
    expect(parseWeightInput('29.9')).toBeNull()
    expect(parseWeightInput('300.1')).toBeNull()
  })
})

describe('calcWeightAverage（11-2）', () => {
  const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })

  it('記録が飛び飛びでも、7日間にある記録だけで平均する', () => {
    const logs = [w('2026-11-01', 110), w('2026-11-02', 104), w('2026-11-05', 103), w('2026-11-08', 102)]
    // 11/8 を含む7日間 = 11/2〜11/8。11/1 は入らない
    const avg = calcWeightAverage(logs, '2026-11-08')
    expect(avg.count).toBe(3)
    expect(avg.avgKg).toBeCloseTo(103)
    expect(avg.isReference).toBe(false)
  })

  it('3件未満は参考値。0件なら null', () => {
    const logs = [w('2026-11-06', 103), w('2026-11-08', 102)]
    expect(calcWeightAverage(logs, '2026-11-08')).toEqual({ avgKg: 102.5, count: 2, isReference: true })
    expect(calcWeightAverage(logs, '2026-11-20')).toEqual({ avgKg: null, count: 0, isReference: true })
  })

  it('月をまたいでも直近7日間で数える（12/2 → 11/26〜12/2）', () => {
    const logs = [w('2026-11-25', 120), w('2026-11-26', 100), w('2026-11-30', 101), w('2026-12-02', 102)]
    const avg = calcWeightAverage(logs, '2026-12-02')
    expect(avg.count).toBe(3)
    expect(avg.avgKg).toBeCloseTo(101)
  })

  it('DBの numeric が文字列で返っても数値として平均する', () => {
    const logs = [{ measured_at: '2026-11-08', weight_kg: '102.4' as unknown as number }]
    expect(calcWeightAverage(logs, '2026-11-08').avgKg).toBeCloseTo(102.4)
  })
})

describe('calcWeekOverWeek（11-2）', () => {
  const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })

  it('その日の7日平均 − 7日前の7日平均', () => {
    const logs = [
      w('2026-11-02', 104), w('2026-11-04', 104), w('2026-11-06', 104), // 11/1〜11/7 平均104
      w('2026-11-09', 103.6), w('2026-11-11', 103.6), w('2026-11-13', 103.6), // 11/8〜11/14 平均103.6
    ]
    const wow = calcWeekOverWeek(logs, '2026-11-14')
    expect(wow.diffKg).toBeCloseTo(-0.4)
    expect(wow.isReference).toBe(false)
  })

  it('どちらかの週に記録が無ければ null、どちらかが3件未満なら参考値', () => {
    const logs = [w('2026-11-06', 104), w('2026-11-09', 103), w('2026-11-11', 103), w('2026-11-13', 103)]
    expect(calcWeekOverWeek(logs, '2026-11-14').isReference).toBe(true)
    expect(calcWeekOverWeek(logs, '2026-11-14').diffKg).toBeCloseTo(-1)
    expect(calcWeekOverWeek(logs, '2026-11-20').diffKg).toBeNull()
  })
})

describe('formatWeightChange', () => {
  it('0.1kg単位で、記号を使わずに書く', () => {
    expect(formatWeightChange(-0.44)).toBe('0.4kg減')
    expect(formatWeightChange(0.2)).toBe('0.2kg増')
    expect(formatWeightChange(0.25)).toBe('0.3kg増')
    expect(formatWeightChange(-0.04)).toBe('変わらず')
    expect(formatWeightChange(-1.26)).not.toMatch(/[−\-+±]/)
  })
})

describe('月の割り直し（11-3）', () => {
  // 104kg・12ヶ月で15kg → ゲート1 −5.25kg（98.75kg）、ゲート2 −4.5kg（94.25kg）…
  // 上限 = min(750, 2800 − 2000) = 750kcal
  const plan = {
    start_date: '2026-11-08',
    period_months: 12,
    gates: calcGates(104, 15, 12).gates,
    tdee: 2800,
    bmr: 2000,
  }
  const avg = (avgKg: number | null, count = 7) => ({ avgKg, count, isReference: count < 3 })

  it('月初の7日平均は前月の最後の7日間（前月の最終日まで）', () => {
    expect(getMonthStartAverageDate(2027, 1)).toBe('2026-12-31')
    expect(getMonthStartAverageDate(2027, 3)).toBe('2027-02-28')
  })

  it('開始月は初回設定の値（保存しない）', () => {
    const t = decideMonthTargets(plan, 2026, 11, avg(103))
    expect(t.basis).toBe('start')
    expect(t.dailySaving).toEqual(calcPlanMonthTargets(plan, 2026, 11).dailySaving)
  })

  it('計画どおりのペースなら、計画どおりの値になる', () => {
    // 1ヶ月目で −1.75kg → 102.25kg。（102.25 − 98.75）÷ 残り2ヶ月 = 1.75kg
    const t = decideMonthTargets(plan, 2026, 12, avg(102.25))
    expect(t.basis).toBe('rebalanced')
    expect(t.monthlyTargetKg).toBeCloseTo(1.75)
    expect(t.dailySaving.savingKcal).toBe(calcPlanMonthTargets(plan, 2026, 12).dailySaving.savingKcal)
    expect(t.ahead).toBe(false)
  })

  it('ゲート1の2ヶ月目：月初の7日平均から目標kgを出す', () => {
    // （103.0 − 98.75）÷ 残り2ヶ月 = 2.125kg → 2.125 × 7200 ÷ 31日 = 493.5 → 494kcal
    const t = decideMonthTargets(plan, 2026, 12, avg(103))
    expect(t.monthNumber).toBe(2)
    expect(t.gateIndex).toBe(1)
    expect(t.gateEndTargetKg).toBeCloseTo(98.75)
    expect(t.remainingMonths).toBe(2)
    expect(t.monthlyTargetKg).toBeCloseTo(2.125)
    expect(t.dailySaving.savingKcal).toBe(494)
    expect(t.dailyIntakeKcal).toBe(2800 - 494)
    expect(t.startAvgKg).toBe(103)
  })

  it('ゲート2の1ヶ月目：ゲート2の終わりの目標体重 ÷ 残り3ヶ月', () => {
    const t = decideMonthTargets(plan, 2027, 2, avg(98.75))
    expect(t.gateIndex).toBe(2)
    expect(t.gateEndTargetKg).toBeCloseTo(94.25)
    expect(t.remainingMonths).toBe(3)
    expect(t.monthlyTargetKg).toBeCloseTo(1.5)
  })

  it('先行：目標kgが0以下なら1日の貯金0（維持）', () => {
    const t = decideMonthTargets(plan, 2026, 12, avg(98.5))
    expect(t.ahead).toBe(true)
    expect(t.monthlyTargetKg).toBeLessThan(0)
    expect(t.dailySaving.savingKcal).toBe(0)
    expect(t.dailySaving.capped).toBe(false)
    expect(t.dailyIntakeKcal).toBe(2800)
  })

  it('遅れて capped：上限で止め、届かない見込みkgを出す', () => {
    // ゲート1の最終月に104kgのまま → 5.25kg ÷ 1ヶ月 → 1219kcal/日 > 上限750
    const t = decideMonthTargets(plan, 2027, 1, avg(104))
    expect(t.dailySaving.capped).toBe(true)
    expect(t.dailySaving.savingKcal).toBe(750)
    expect(t.dailySaving.uncappedKcal).toBe(1219)
    // （1219 − 750）× 31日 × 1ヶ月 ÷ 7200
    expect(t.shortfallKg).toBeCloseTo((469 * 31) / 7200)
  })

  it('月初の7日平均が3件未満なら計画どおり', () => {
    const t = decideMonthTargets(plan, 2026, 12, avg(110, 2))
    expect(t.basis).toBe('plan')
    expect(t.dailySaving).toEqual(calcPlanMonthTargets(plan, 2026, 12).dailySaving)
    expect(t.startAvgCount).toBe(2)
  })

  it('期間を過ぎたら finished（貯金0）', () => {
    const t = decideMonthTargets(plan, 2027, 11, avg(90))
    expect(t.basis).toBe('finished')
    expect(t.dailySaving.savingKcal).toBe(0)
  })

  it('どの月を保存するか：開始月・期間後・まだ来ていない月は保存しない', () => {
    expect(getMonthTargetMode(plan, 2026, 11, '2026-12-03')).toBe('start')
    expect(getMonthTargetMode(plan, 2026, 12, '2026-12-03')).toBe('decide')
    expect(getMonthTargetMode(plan, 2027, 1, '2026-12-03')).toBe('provisional')
    expect(getMonthTargetMode(plan, 2027, 11, '2027-11-03')).toBe('finished')
  })

  it('保存した行から同じ値に戻せる', () => {
    const t = decideMonthTargets(plan, 2027, 1, avg(104))
    const row = { ...monthTargetsToRow(t, 'u1', 'g1'), id: 'r1', created_at: '' }
    const back = monthTargetsFromRow(plan, row)
    expect(back.dailySaving).toEqual(t.dailySaving)
    expect(back.dailyIntakeKcal).toBe(t.dailyIntakeKcal)
    expect(back.shortfallKg).toBeCloseTo(t.shortfallKg, 2)
    expect(back.basis).toBe('rebalanced')
    expect(() => monthTargetsToRow(decideMonthTargets(plan, 2026, 11, avg(104)), 'u1', 'g1')).toThrow()
  })

  it('先行の行を読み直しても ahead になる', () => {
    const t = decideMonthTargets(plan, 2026, 12, avg(98.5))
    const back = monthTargetsFromRow(plan, { ...monthTargetsToRow(t, 'u1', 'g1'), id: 'r1', created_at: '' })
    expect(back.ahead).toBe(true)
  })

  it('期間を延ばす：今の7日平均から目標まで上限ペースで何ヶ月か（3ヶ月単位）', () => {
    // 15kg ÷（650 × 30.4 ÷ 7200 ≒ 2.74kg/月）≒ 5.5ヶ月 → 6ヶ月
    expect(calcExtendedPeriodMonths(104, 89, 650)).toBe(6)
    expect(calcExtendedPeriodMonths(104, 89, 0)).toBeNull()
  })
})

describe('進捗チャート（11-4）', () => {
  const plan = {
    start_date: '2026-11-08',
    period_months: 12,
    start_weight_kg: 104,
    gates: calcGates(104, 15, 12).gates,
  }

  it('ゲートの終わり = 開始月から数えて3iヶ月目の月末', () => {
    expect(getPlanMonthEndDate('2026-11-08', 3)).toBe('2027-01-31')
    expect(getPlanMonthEndDate('2026-11-08', 6)).toBe('2027-04-30')
    expect(getPlanMonthEndDate('2026-11-08', 12)).toBe('2027-10-31')
    expect(getPlanMonthEndDate('2027-12-01', 3)).toBe('2028-02-29') // うるう年
  })

  it('目標ラインは開始点と各ゲートの終わりを結ぶ', () => {
    const line = buildTargetLine(plan)
    expect(line.map((p) => p.date)).toEqual(['2026-11-08', '2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31'])
    expect(line[1].kg).toBeCloseTo(98.75)
    expect(line[2].kg).toBeCloseTo(94.25)
    expect(line[0].gateIndex).toBeNull()
    expect(line[4].gateIndex).toBe(4)
  })

  it('区切りと区切りの間は日数で直線に結んだ値', () => {
    const line = buildTargetLine(plan)
    // 開始〜ゲート1：84日で −5.25kg。42日目（12/20）はちょうど半分
    expect(daysBetween('2026-11-08', '2027-01-31')).toBe(84)
    expect(getTargetWeightOn(line, '2026-12-20')).toBeCloseTo(104 - 5.25 / 2)
    // ゲート1〜ゲート2（1/31〜4/30、89日で −4.5kg）の30日目
    expect(getTargetWeightOn(line, '2027-03-02')).toBeCloseTo(98.75 - (4.5 * 30) / 89)
    // 区切りの日はその目標体重。開始前・終了後は端の値
    expect(getTargetWeightOn(line, '2027-01-31')).toBeCloseTo(98.75)
    expect(getTargetWeightOn(line, '2026-11-01')).toBe(104)
    expect(getTargetWeightOn(line, '2028-01-01')).toBeCloseTo(89)
  })

  it('目標ラインとの差：マイナスなら先行', () => {
    const line = buildTargetLine(plan)
    const ahead = calcTargetGap(101.5, line, '2026-12-20')!
    expect(ahead.diffKg).toBeCloseTo(101.5 - 101.375)
    expect(ahead.ahead).toBe(false)
    expect(calcTargetGap(101, line, '2026-12-20')!.ahead).toBe(true)
    expect(calcTargetGap(null, line, '2026-12-20')).toBeNull()
  })

  it('期間の切り替え：開始直後は開始日から、全期間は計画の終わりまで', () => {
    expect(getChartRange('1m', '2026-11-10', plan)).toEqual({ from: '2026-11-08', to: '2026-12-07' })
    expect(getChartRange('1m', '2027-03-01', plan)).toEqual({ from: '2027-01-31', to: '2027-03-01' })
    expect(getChartRange('3m', '2027-03-01', plan).from).toBe('2026-12-02')
    expect(getChartRange('all', '2027-03-01', plan)).toEqual({ from: '2026-11-08', to: '2027-10-31' })
  })

  it('7日平均の線は記録の無い7日間で途切れ、目標ラインは範囲の端で補間する', () => {
    const logs = [
      { measured_at: '2026-11-08', weight_kg: 104 },
      { measured_at: '2026-11-09', weight_kg: 103.8 },
      { measured_at: '2026-11-25', weight_kg: 102.6 },
    ]
    const data = buildWeightChartData(logs, plan, '1m', '2026-11-27')
    expect(data.from).toBe('2026-11-08')
    expect(data.days).toBe(30)
    expect(data.dailyPoints).toHaveLength(3)
    // 11/8〜11/15 が1本目（11/15 は 11/9 を含む）、11/25〜11/27 が2本目
    expect(data.averageSegments).toHaveLength(2)
    expect(data.averageSegments[0].at(-1)!.date).toBe('2026-11-15')
    expect(data.averageSegments[1][0].date).toBe('2026-11-25')
    expect(data.averageSegments[1].at(-1)!.date).toBe('2026-11-27') // 今日まで
    expect(data.targetLine[0]).toEqual({ date: '2026-11-08', kg: 104 })
    expect(data.targetLine.at(-1)!.kg).toBeCloseTo(getTargetWeightOn(buildTargetLine(plan), '2026-12-07'))
    expect(data.gateMarkers).toEqual([])
    expect(data.yMax).toBeGreaterThanOrEqual(104.5)
  })

  it('全期間はゲートの区切りを4つ持つ', () => {
    const data = buildWeightChartData([], plan, 'all', '2026-11-10')
    expect(data.gateMarkers.map((g) => g.gateIndex)).toEqual([1, 2, 3, 4])
    expect(data.averageSegments).toEqual([])
  })
})

describe('ゲート達成・3%・5%（11-5）', () => {
  // 104kg：ゲート1 98.75kg、3% = 3.12kg（100.88kg）、5% = 5.2kg（98.8kg）
  const plan = { start_weight_kg: 104, gates: calcGates(104, 15, 12).gates }
  const avg = (avgKg: number, count = 7) => ({ avgKg, count, isReference: count < 3 })
  const kinds = (ms: { kind: string }[]) => ms.map((m) => m.kind)

  it('3%に達したら一言を出す', () => {
    const ms = detectNewMilestones(plan, avg(100.8), new Set())
    expect(kinds(ms)).toEqual(['loss3'])
    expect(ms[0].message).toContain('血糖値')
  })

  it('ゲートの終わりの目標体重以下でゲート達成。5%も同時に', () => {
    expect(kinds(detectNewMilestones(plan, avg(98.75), new Set(['loss3'])))).toEqual(['gate1', 'loss5'])
  })

  it('ゲート達成の一言は記号を使わない：「開始から 5.3kg 減った」', () => {
    const [gate] = detectNewMilestones(plan, avg(98.75), new Set(['loss3', 'loss5']))
    expect(gate.message).toBe('開始から 5.3kg 減った。この調子でいこう')
  })

  it('出したものは二度出さない', () => {
    expect(detectNewMilestones(plan, avg(98), new Set(['gate1', 'loss3', 'loss5']))).toEqual([])
  })

  it('参考値（3件未満）のときは出さない', () => {
    expect(detectNewMilestones(plan, avg(95, 2), new Set())).toEqual([])
  })

  it('まだ届いていなければ何も出さない', () => {
    expect(detectNewMilestones(plan, avg(101), new Set())).toEqual([])
  })
})

describe('食べものの辞書と例の合計kcal（13.2）', () => {
  it('辞書の kcal × 数量の合計', () => {
    expect(calcMealExampleKcal([{ id: 'onigiri_salmon', qty: 1 }, { id: 'cup_noodle', qty: 1 }])).toBe(180 + 350)
    expect(calcMealExampleKcal([{ id: 'rice', qty: 2 }, { id: 'miso_soup', qty: 1 }])).toBe(540)
    expect(calcMealExampleKcal([])).toBe(0)
  })

  it('内訳は「名前 + 数量 + 単位」と、その行のkcal', () => {
    expect(buildMealExampleBreakdown([{ id: 'onigiri_salmon', qty: 1 }, { id: 'karaage', qty: 2 }])).toEqual([
      { id: 'onigiri_salmon', label: 'おにぎり（鮭）1個', kcal: 180 },
      { id: 'karaage', label: '唐揚げ（5個）2皿', kcal: 700 },
    ])
  })

  it('例はすべて辞書にある id と1以上の数量でできている', () => {
    for (const m of MEAL_EXAMPLES) {
      expect(m.items.length, m.name).toBeGreaterThan(0)
      for (const i of m.items) {
        expect(FOOD_ITEM_MAP[i.id], `${m.name} ${i.id}`).toBeDefined()
        expect(i.qty).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('チートのアイテム表も辞書の kcal を使う', () => {
    for (const item of CHEAT_ITEMS) {
      expect(item.foodId).toBeDefined()
      expect(item.kcal).toBe(FOOD_ITEM_MAP[item.foodId!].kcal)
    }
  })

  it('50kcal単位の切り上げ', () => {
    expect(roundUpKcal(1049)).toBe(1050)
    expect(roundUpKcal(1050)).toBe(1050)
    expect(roundUpKcal(1051)).toBe(1100)
    expect(roundUpKcal(1001)).toBe(1050)
  })
})

describe('ゼロカロ化（13.3）', () => {
  const wantRow = (over: Partial<MonthlyWantRow>): MonthlyWantRow => ({
    id: over.label ?? 'x',
    user_id: 'u',
    kind: 'other',
    scheduled_date: null,
    times_per_week: null,
    label: null,
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
    cheat_type: 'addon',
    replace_slot: null,
    items: null,
    total_kcal: null,
    ...over,
  })
  const dated = (label: string, date: string, costPt: number, over: Partial<MonthlyWantRow> = {}): GaugeCheatEntry => ({
    mode: 'dated',
    row: wantRow({ label, scheduled_date: date, ...over }),
    date,
    costPt,
    done: false,
  })
  const freq = (label: string, costPt: number, created_at: string): GaugeCheatEntry => ({
    mode: 'frequency',
    row: wantRow({ label, times_per_week: 1, created_at }),
    timesPerWeek: 1,
    timesInMonth: 4,
    costPerTimePt: costPt / 4,
    costPt,
  })
  const hearty = (date: string, slot: 'morning' | 'lunch' | 'dinner'): GaugeCheatEntry => ({
    mode: 'hearty',
    date,
    slot,
    costPt: 300,
  })
  const names = (es: GaugeCheatEntry[]) => es.map(getGaugeCheatName)

  it('並び順：日付のあるものは日付順（同じ日は朝・昼・夜）、日付のないものは後ろに登録順', () => {
    const ordered = orderZeroCalCheats([
      freq('週1ラーメン', 2000, '2026-11-03T00:00:00Z'),
      dated('ワイン1本', '2026-11-20', 550),
      freq('週1ケーキ', 1000, '2026-11-01T00:00:00Z'),
      hearty('2026-11-05', 'dinner'),
      dated('焼肉', '2026-11-05', 1200, { cheat_type: 'replace', replace_slot: 'lunch' }),
    ])
    expect(names(ordered)).toEqual(['焼肉', '🔥がっつり（11/5 夜）', 'ワイン1本', '週1ケーキ', '週1ラーメン'])
  })

  it('累計コストが貯まったpt以下のものが0kcal化済み（ちょうど同じ値も済み）', () => {
    const cheats = [dated('ワイン1本', '2026-11-03', 550), dated('ハイボール1杯', '2026-11-04', 80), dated('ケーキ', '2026-11-10', 350)]
    const s = calcZeroCalStatus(cheats, 630)
    expect(s.entries.map((e) => e.zeroed)).toEqual([true, true, false])
    expect(s.entries.map((e) => e.cumulativePt)).toEqual([550, 630, 980])
    expect(s.zeroedPt).toBe(630)
    expect(s.totalPt).toBe(980)
    expect(s.next && getGaugeCheatName(s.next.entry)).toBe('ケーキ')
    expect(s.next?.remainingPt).toBe(350)
    expect(s.next?.tamemeshiNeeded).toBe(3) // 350 ÷ 150 を切り上げ
    expect(s.extraPt).toBe(0)

    const s2 = calcZeroCalStatus(cheats, 629)
    expect(s2.entries.map((e) => e.zeroed)).toEqual([true, false, false])
    expect(s2.next?.remainingPt).toBe(1)
    expect(s2.next?.tamemeshiNeeded).toBe(1)
  })

  it('チート0件', () => {
    const s = calcZeroCalStatus([], 300)
    expect(s.entries).toEqual([])
    expect(s.next).toBeNull()
    expect(s.zeroedPt).toBe(0)
    expect(s.totalPt).toBe(0)
    expect(describeZeroCalHeadline(s)).toBe('食べたいものを先に決めよう')
    expect(buildGaugeMarkers(s)).toEqual([])
  })

  it('全部済み：あと◯kcal分を追加できる。マイナスは出さない', () => {
    const cheats = [dated('ワイン1本', '2026-11-03', 550)]
    const s = calcZeroCalStatus(cheats, 700)
    expect(s.next).toBeNull()
    expect(s.zeroedPt).toBe(550)
    expect(s.extraPt).toBe(150)
    const s0 = calcZeroCalStatus(cheats, 0)
    expect(s0.zeroedPt).toBe(0)
    expect(s0.next?.tamemeshiNeeded).toBe(4) // 550 ÷ 150 = 3.67 → 4
    expect(calcZeroCalStatus(cheats, -100).zeroedPt).toBe(0)
  })

  it('見出し：0kcal化済みだけを「・」でつなぐ。4件以上は「ほか◯件」', () => {
    const cheats = [dated('ワイン1本', '2026-11-03', 550), dated('ハイボール1杯', '2026-11-04', 80), dated('ケーキ', '2026-11-10', 350)]
    expect(describeZeroCalHeadline(calcZeroCalStatus(cheats, 630))).toBe('ワイン1本・ハイボール1杯、実質0kcalで ごちそうさまでした')
    expect(describeZeroCalHeadline(calcZeroCalStatus(cheats, 100))).toBe('最初のチートまで、あとメシため3回')
    const many = [...cheats, dated('大福', '2026-11-11', 240), dated('パフェ', '2026-11-12', 600)]
    expect(describeZeroCalHeadline(calcZeroCalStatus(many, 5000))).toBe(
      'ワイン1本・ハイボール1杯・ケーキほか2件、実質0kcalで ごちそうさまでした'
    )
  })

  it('新たに0kcal化済みになったチート（記録の前後のpt）。複数なら最後の1件', () => {
    const cheats = [dated('ワイン1本', '2026-11-03', 550), dated('ハイボール1杯', '2026-11-04', 80), dated('ケーキ', '2026-11-10', 350)]
    expect(detectNewlyZeroed(cheats, 450, 600)).toBe(cheats[0])
    expect(detectNewlyZeroed(cheats, 450, 630)).toBe(cheats[1]) // 2件なったら最後の1件
    expect(detectNewlyZeroed(cheats, 600, 620)).toBeNull() // 増えたけど次に届かない
    expect(detectNewlyZeroed(cheats, 630, 630)).toBeNull()
    expect(detectNewlyZeroed(cheats, 700, 550)).toBeNull() // 減ったとき
    expect(detectNewlyZeroed([], 0, 300)).toBeNull()
  })

  it('ゲージのアイコン：累計の位置。近いものは1つにまとめる', () => {
    const cheats = [dated('ワイン1本', '2026-11-03', 550), dated('ハイボール1杯', '2026-11-04', 50), dated('ケーキ', '2026-11-10', 400)]
    const markers = buildGaugeMarkers(calcZeroCalStatus(cheats, 600))
    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({ ratio: 0.6, count: 2, zeroed: true })
    expect(markers[1]).toMatchObject({ ratio: 1, count: 1, zeroed: false })
    expect(markers.map((m) => m.emoji)).toEqual(['★', '★'])
    expect(buildGaugeMarkers(calcZeroCalStatus([hearty('2026-11-05', 'dinner')], 0))[0].emoji).toBe('🔥')
  })
})

describe('月初めからの体重の変化（13.4）', () => {
  const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })
  // 基準：11/2〜11/8 の記録の平均。いま：今日までの7日間
  const base = [w('2026-11-02', 103.0), w('2026-11-03', 102.8), w('2026-11-05', 102.6)] // 平均 102.8

  it('記録が足りないとき・期間が重なるときは null', () => {
    expect(calcMonthWeightChange([], '2026-11-20')).toBeNull()
    // いまの期間の記録が2件
    expect(calcMonthWeightChange([...base, w('2026-11-18', 102.0), w('2026-11-20', 102.0)], '2026-11-20')).toBeNull()
    // 基準の期間の記録が2件
    expect(
      calcMonthWeightChange([...base.slice(0, 2), w('2026-11-15', 102), w('2026-11-17', 102), w('2026-11-20', 102)], '2026-11-20')
    ).toBeNull()
    // 月の初め：いまの期間（11/4〜11/10）が基準（11/2〜11/8）と重なる
    expect(calcMonthWeightChange([...base, w('2026-11-09', 102), w('2026-11-10', 102), w('2026-11-07', 102)], '2026-11-10')).toBeNull()
    // 前の月の記録は基準に使わない
    expect(calcMonthWeightChange([w('2026-10-30', 104), w('2026-10-31', 104), w('2026-11-01', 104)], '2026-11-20')).toBeNull()
  })

  it('減・増・変わらず（0.1kg未満）', () => {
    const now = (kg: number) => [w('2026-11-16', kg), w('2026-11-18', kg), w('2026-11-20', kg)]
    const down = calcMonthWeightChange([...base, ...now(102.4)], '2026-11-20')
    expect(down).toBeCloseTo(-0.4)
    expect(describeMonthWeightChange(down!)).toBe('これだけ食べて、月初めから0.4kg減')
    const up = calcMonthWeightChange([...base, ...now(103.0)], '2026-11-20')
    expect(describeMonthWeightChange(up!)).toBe('これだけ食べて、月初めから0.2kg増')
    const same = calcMonthWeightChange([...base, ...now(102.85)], '2026-11-20')
    expect(describeMonthWeightChange(same!)).toBe('これだけ食べて、月初めから変わらず')
    expect(describeMonthWeightChange(-0.099)).toBe('これだけ食べて、月初めから変わらず')
    expect(describeMonthWeightChange(-0.1)).toBe('これだけ食べて、月初めから0.1kg減')
  })

  it('基準とつながる最初の日：基準の終わりの次の日から「いま」を出せる', () => {
    // 基準 11/2〜11/8、いま 11/9〜11/15（today = 11/15）
    const logs = [...base, w('2026-11-09', 102.5), w('2026-11-12', 102.5), w('2026-11-15', 102.5)]
    expect(calcMonthWeightChange(logs, '2026-11-15')).toBeCloseTo(-0.3)
    expect(calcMonthWeightChange(logs, '2026-11-14')).toBeNull()
  })
})
