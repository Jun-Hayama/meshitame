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
  getCheatKind,
  buildCheatLabel,
  getMonthlyWantRowCost,
  sortCheatItemsByUsage,
  getReplacedMealKeys,
  calcMonthEarnedPt,
  calcMonthEarnedBreakdown,
  calcDailyIntakeFromPace,
  calcPaceKgPerMonth,
  expandHeartyCheats,
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
  shouldShowWeightReassurance,
  isWeightRisingThreeWeeks,
  calcMonthWeightChange,
  describeMonthWeightChange,
  calcBeerEquivalent,
  calcExerciseMinutes,
  formatExerciseLog,
  buildLogDays,
  buildCheatEvents,
  calcWeightYRange,
  calcWeightChangeInRange,
  describeWeightChangeShort,
  buildCheatWeightChart,
  getCheatPlace,
  listCheatsInRange,
  calcCarryover,
  calcMonthCheatStatus,
  detectNewlyCleared,
  getCheatName,
  getCheatItemEmojis,
  hasMonthCheats,
  calcCheatCardBar,
  pickCheatEquivalent,
  describeCheatHeadline,
  pickEasiestWay,
  describeEasiestWay,
  buildCheatHints,
  formatDurationMinutes,
  formatSteps,
  describeDayExercises,
  describeShortLabel,
  getCheatLoadFrom,
  isCheatCovered,
  describePlannedLine,
  describeMeshitameToast,
  describeExerciseToast,
  describeRecordToast,
  describeCardWayLine,
  pickFrequentExercises,
  pickFrequentCheatItems,
} from '@/lib/calories'
import type { ExerciseLogRow, MealLogRow, MonthlyWantRow, WantEntry } from '@/types'
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

  it('kind は最初に選んだアイテムのジャンルから', () => {
    expect(getCheatKind([iekei])).toBe('ramen')
    expect(getCheatKind([beer])).toBe('evening_drink')
    expect(getCheatKind([{ genre: 'cake' }])).toBe('other')
  })

  it('名前は数量つきでつなぐ', () => {
    expect(buildCheatLabel([beer, karaage])).toBe('ビール500ml×2＋唐揚げ')
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
    expect(week.earned).toEqual({ tamemeshiCount: 2, tamemeshiPt: 300, exerciseCount: 2, exercisePt: 300, totalPt: 600 })
    expect(week.cheats.map((e) => (e.kind === 'hearty' ? `🔥${e.date}` : `★${e.date}`))).toEqual(['🔥2026-12-02', '★2026-12-05'])
    expect(week.cheatKcal).toBe(800)
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

  it('言葉はポジティブに・kcal で・符号なし：1950kcal → 飲み会1回ぶん', () => {
    expect(describeWeekEarned(1950)).toBe('今週は 1,950kcal 貯まりました。飲み会1回ぶんです🍻')
    expect(describeWeekEarned(600)).toBe('今週は 600kcal 貯まりました。ワイン1本ぶんです🍷')
    expect(describeWeekEarned(150)).toBe('今週は 150kcal 貯まりました。ビール1本ぶんです🍺')
    expect(describeWeekEarned(100)).toBe('今週は 100kcal 貯まりました')
    expect(describeWeekEarned(0)).not.toMatch(/[−+-]\d|pt/)
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

describe('ログ（14.3）', () => {
  const meal = (log_date: string, slot: 'morning' | 'lunch' | 'dinner', choice: 'light' | 'normal' | 'hearty'): MealLogRow => ({
    id: `${log_date}:${slot}`,
    user_id: 'u',
    log_date,
    slot,
    choice,
    created_at: `${log_date}T00:00:00Z`,
  })
  const ex = (
    id: string,
    log_date: string,
    type: ExerciseLogRow['exercise_type'],
    amount: number,
    points: number
  ): ExerciseLogRow => ({
    id,
    user_id: 'u',
    log_date,
    exercise_type: type,
    minutes: type === 'steps' ? null : amount,
    steps: type === 'steps' ? amount : null,
    points,
    created_at: `${log_date}T01:00:00Z`,
  })

  it('ビール換算：生ビール中ジョッキ（200kcal）で割って切り捨て', () => {
    expect(calcBeerEquivalent(0)).toBe(0)
    expect(calcBeerEquivalent(199)).toBe(0) // 1杯未満
    expect(calcBeerEquivalent(200)).toBe(1)
    expect(calcBeerEquivalent(1050)).toBe(5) // 5.25 → 5
  })

  it('うごための合計時間：歩数で記録したものは分に含めない', () => {
    const logs = [
      ex('a', '2026-11-03', 'walking', 30, 150),
      ex('b', '2026-11-04', 'steps', 8000, 280),
      ex('c', '2026-11-05', 'running', 20, 200),
      ex('d', '2026-10-31', 'walking', 60, 300),
    ]
    expect(calcExerciseMinutes(logs, '2026-11-01', '2026-11-10')).toBe(50)
  })

  it('うごための表記', () => {
    expect(formatExerciseLog(ex('a', '2026-11-03', 'walking', 30, 150))).toBe('ウォーキング30分')
    expect(formatExerciseLog(ex('b', '2026-11-03', 'steps', 8000, 280))).toBe('8,000歩')
  })

  it('一覧：14日分・新しい日が上・記録がない日は出さない', () => {
    const meals = [
      meal('2026-11-10', 'dinner', 'light'),
      meal('2026-11-10', 'morning', 'light'),
      meal('2026-11-10', 'lunch', 'normal'),
      meal('2026-11-09', 'lunch', 'hearty'),
      meal('2026-10-27', 'morning', 'light'), // 14日より前
      meal('2026-10-28', 'morning', 'light'), // 14日目（今日を含む）
    ]
    const exercises = [ex('e1', '2026-11-08', 'walking', 30, 150)]
    const days = buildLogDays({ today: '2026-11-10', mealLogs: meals, exerciseLogs: exercises, filter: 'all' })
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08', '2026-10-28'])
    expect(days[1].entries.map((e) => [e.kind, e.kcal])).toEqual([['cheat', 300]]) // 品なしの🔥チート
    expect(days[0].entries.map((e) => (e.kind === 'meal' ? e.log.slot : e.kind))).toEqual(['morning', 'dinner'])
    expect(days[0].entries[0].kcal).toBe(150)
    expect(buildLogDays({ today: '2026-11-10', mealLogs: meals, exerciseLogs: exercises, filter: 'meal' }).map((d) => d.date)).toEqual([
      '2026-11-10',
      '2026-10-28',
    ])
    expect(buildLogDays({ today: '2026-11-10', mealLogs: meals, exerciseLogs: exercises, filter: 'exercise' }).map((d) => d.date)).toEqual([
      '2026-11-08',
    ])
  })

  it('チートの行も出す（食事 → 追加チートの順）。食事のチートがある食事のメシためは出さない', () => {
    const slotTargets = [
      { slot: 'morning' as const, kcal: 500 },
      { slot: 'lunch' as const, kcal: 700 },
      { slot: 'dinner' as const, kcal: 800 },
    ]
    const cheat = (over: Partial<MonthlyWantRow>): MonthlyWantRow => ({
      id: over.label ?? 'c', user_id: 'u', kind: 'other', scheduled_date: '2026-11-10', times_per_week: null,
      label: null, is_active: true, created_at: '2026-11-01T00:00:00Z',
      cheat_type: 'addon', replace_slot: null, items: null, total_kcal: 280, ...over,
    })
    const wants = [
      cheat({ label: 'ビール500ml×2' }),
      cheat({ label: 'ラーメン', cheat_type: 'replace', replace_slot: 'lunch', total_kcal: 1000 }),
      cheat({ label: '先の予定', scheduled_date: '2026-11-12' }),
    ]
    const days = buildLogDays({
      today: '2026-11-10',
      mealLogs: [meal('2026-11-10', 'lunch', 'light'), meal('2026-11-10', 'dinner', 'light')],
      exerciseLogs: [],
      wants,
      slotTargets,
      filter: 'all',
    })
    expect(days).toHaveLength(1)
    expect(days[0].entries.map((e) => [e.kind, e.kcal])).toEqual([
      ['cheat', 300], // 昼のラーメン 1000 − 700
      ['meal', 150], // 夜のメシため
      ['cheat', 280], // 追加チート
    ])
    expect(buildLogDays({ today: '2026-11-10', mealLogs: [], exerciseLogs: [], wants, slotTargets, filter: 'meal' })).toEqual([])
  })
})

describe('体重チャート：チートの累計（14.4）', () => {
  const slotTargets = [
    { slot: 'morning' as const, kcal: 500 },
    { slot: 'lunch' as const, kcal: 700 },
    { slot: 'dinner' as const, kcal: 800 },
  ]
  const want = (over: Partial<MonthlyWantRow>): MonthlyWantRow => ({
    id: Math.random().toString(36).slice(2),
    user_id: 'u',
    kind: 'other',
    scheduled_date: null,
    times_per_week: null,
    label: 'チート',
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
    cheat_type: 'addon',
    replace_slot: null,
    items: [{ genre: 'cake', name: 'ショートケーキ', kcal: 350, qty: 1 }],
    total_kcal: 350,
    ...over,
  })
  const hearty = (log_date: string, slot: 'morning' | 'lunch' | 'dinner' = 'dinner') => ({ log_date, slot, choice: 'hearty' as const })

  it('日付のあるチートと品なしの🔥チートを日付に。今日より先・期間より前は数えない', () => {
    const events = buildCheatEvents({
      wants: [
        want({ scheduled_date: '2026-11-03' }),
        want({ scheduled_date: '2026-11-20' }), // 今日より先
        want({ scheduled_date: '2026-10-30' }), // 期間より前
        want({ times_per_week: 1 }), // 週◯回は棒に入れない
      ],
      mealLogs: [hearty('2026-11-05'), hearty('2026-11-12')],
      slotTargets,
      from: '2026-11-01',
      today: '2026-11-10',
    })
    expect(events.map((e) => [e.date, e.costPt, e.emoji])).toEqual([
      ['2026-11-03', 350, '🍰'],
      ['2026-11-05', 300, '🔥'],
    ])
  })

  it('品つきの食事のチートがある食事の🔥チート300は数えない', () => {
    const events = buildCheatEvents({
      wants: [want({ scheduled_date: '2026-11-05', cheat_type: 'replace', replace_slot: 'dinner', total_kcal: 1200 })],
      mealLogs: [hearty('2026-11-05', 'dinner')],
      slotTargets,
      from: '2026-11-01',
      today: '2026-11-10',
    })
    expect(events.map((e) => e.costPt)).toEqual([400]) // 1200 − 夜の目安800
  })

  it('棒は階段状の累計。今日より先は null、週◯回は数えない', () => {
    const chart = buildCheatWeightChart({
      period: 'month',
      today: '2026-11-10',
      weightLogs: [],
      wants: [want({ scheduled_date: '2026-11-03' }), want({ times_per_week: 2, created_at: '2026-10-05T00:00:00Z' })],
      mealLogs: [hearty('2026-11-05')],
      slotTargets,
    })
    expect(chart.from).toBe('2026-11-01')
    expect(chart.to).toBe('2026-11-30')
    expect(chart.bars).toHaveLength(30)
    expect(chart.bars.slice(0, 6).map((b) => b.cumulativeKcal)).toEqual([0, 0, 350, 350, 650, 650])
    expect(chart.bars[9].cumulativeKcal).toBe(650) // 今日
    expect(chart.bars[10].cumulativeKcal).toBeNull() // 明日
    expect(chart.maxKcal).toBe(650)
    expect(chart.totalKcal).toBe(650)
    expect(chart.yMin).toBeNull() // 体重の記録なし
  })

  it('はじめてから：最初に体重を記録した日から、週ごとの累計と週の平均', () => {
    const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })
    const chart = buildCheatWeightChart({
      period: 'all',
      today: '2026-11-10', // 火曜
      weightLogs: [w('2026-10-28', 104), w('2026-10-30', 103), w('2026-11-03', 103.5), w('2026-11-10', 102)],
      wants: [want({ scheduled_date: '2026-11-03' }), want({ scheduled_date: '2026-10-20' })],
      mealLogs: [hearty('2026-10-29')],
      slotTargets,
    })
    expect(chart.from).toBe('2026-10-28') // 水曜
    expect(chart.bars.map((b) => [b.from, b.to])).toEqual([
      ['2026-10-28', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-10'],
    ])
    expect(chart.bars.map((b) => b.cumulativeKcal)).toEqual([300, 650, 650]) // 10/20 は期間より前
    expect(chart.weightPoints.map((p) => [p.index, p.kg])).toEqual([
      [0, 103.5],
      [1, 103.5],
      [2, 102],
    ])
  })
})

describe('体重の縦の範囲（14.4）', () => {
  it('±2kg に収まるときは中心 ± 2kg', () => {
    expect(calcWeightYRange([103, 102.1, 101.5], 103)).toEqual({ yMin: 101, yMax: 105 })
  })

  it('外れる値があるときだけ、収まるように広げる', () => {
    const r = calcWeightYRange([103, 100.5], 103)
    expect(r.yMin).toBeCloseTo(100.3)
    expect(r.yMax).toBe(105)
    const up = calcWeightYRange([103, 105.6], 103)
    expect(up.yMin).toBe(101)
    expect(up.yMax).toBeCloseTo(105.8)
  })
})

describe('期間を指定した体重変化（14.4）', () => {
  const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })
  const oct = [w('2026-10-01', 105), w('2026-10-02', 105), w('2026-10-04', 105)] // はじめての7日間 平均105
  const novBase = [w('2026-11-01', 103.5), w('2026-11-02', 103.4), w('2026-11-03', 103.3)] // 今月の基準 103.4
  const now = [w('2026-11-14', 103.0), w('2026-11-15', 103.0), w('2026-11-16', 103.0)]
  const logs = [...oct, ...novBase, ...now]

  it('今月：月の最初の記録からの7日間が基準', () => {
    expect(calcWeightChangeInRange(logs, '2026-11-01', '2026-11-16')).toBeCloseTo(-0.4)
    expect(calcMonthWeightChange(logs, '2026-11-16')).toBeCloseTo(-0.4)
  })

  it('はじめてから：最初に体重を記録した日からの7日間が基準', () => {
    const diff = calcWeightChangeInRange(logs, '2026-10-01', '2026-11-16')
    expect(diff).toBeCloseTo(-2.0)
    expect(describeWeightChangeShort(diff!)).toBe('体重 2.0kg減')
  })

  it('記録が足りないときは null', () => {
    expect(calcWeightChangeInRange([], '2026-10-01', '2026-11-16')).toBeNull()
    expect(calcWeightChangeInRange([...oct, w('2026-11-16', 103)], '2026-10-01', '2026-11-16')).toBeNull()
    expect(calcWeightChangeInRange(logs, '2026-11-01', '2026-11-05')).toBeNull() // 基準と重なる
  })

  it('表記：0.1kg未満は「変わらず」', () => {
    expect(describeWeightChangeShort(0.05)).toBe('体重 変わらず')
    expect(describeWeightChangeShort(0.2)).toBe('体重 0.2kg増')
  })
})

describe('体重が上がった日のひと言（15.3）', () => {
  const w = (measured_at: string, weight_kg: number) => ({ measured_at, weight_kg })
  // 11/10〜11/16 に 100kg が3件
  const base = [w('2026-11-10', 100), w('2026-11-13', 100), w('2026-11-16', 100)]
  const input = (over: Partial<Parameters<typeof shouldShowWeightReassurance>[0]>) => ({
    logs: base,
    date: '2026-11-17',
    weightKg: 100.5,
    onPace: true,
    risingThreeWeeks: false,
    ...over,
  })

  it('前日までの7日間の平均より0.5kg以上高く、順調なら出す', () => {
    expect(shouldShowWeightReassurance(input({}))).toBe(true)
    expect(shouldShowWeightReassurance(input({ weightKg: 100.4 }))).toBe(false)
  })

  it('その日の記録は平均に含めない（保存後の記録を渡しても同じ）', () => {
    expect(shouldShowWeightReassurance(input({ logs: [...base, w('2026-11-17', 100.5)] }))).toBe(true)
  })

  it('前日までの7日間の記録が3件未満なら出さない（8日前の記録は数えない）', () => {
    const logs = [w('2026-11-09', 100), w('2026-11-13', 100), w('2026-11-16', 100)]
    expect(shouldShowWeightReassurance(input({ logs }))).toBe(false)
    expect(shouldShowWeightReassurance(input({ logs: [] }))).toBe(false)
  })

  it('順調でないとき・3週続けて増えているときは出さない', () => {
    expect(shouldShowWeightReassurance(input({ onPace: false }))).toBe(false)
    expect(shouldShowWeightReassurance(input({ risingThreeWeeks: true }))).toBe(false)
  })

  it('過去の日に保存したときは、その日の前日までの7日間で見る', () => {
    const logs = [w('2026-11-05', 100), w('2026-11-07', 100), w('2026-11-09', 100), w('2026-11-14', 103)]
    expect(shouldShowWeightReassurance(input({ logs, date: '2026-11-10', weightKg: 100.6 }))).toBe(true)
  })
})

describe('3週続けて増えている（15.3）', () => {
  // 毎日記録。7日ごとに step kg ずつ上がる（前週比 = step）
  const daily = (from: string, days: number, kgAt: (i: number) => number) =>
    Array.from({ length: days }, (_, i) => ({ measured_at: addDaysToDateStr(from, i), weight_kg: kgAt(i) }))
  const today = '2026-11-28'
  const from = addDaysToDateStr(today, -27) // 14日前の前週比まで出せる4週間

  it('今日・7日前・14日前の前週比がどれも0.1kg以上の増なら true', () => {
    const logs = daily(from, 28, (i) => 100 + Math.floor(i / 7) * 0.1)
    expect(isWeightRisingThreeWeeks(logs, today)).toBe(true)
  })

  it('四捨五入で0.1kgに届かない週があれば false', () => {
    const logs = daily(from, 28, (i) => 100 + Math.floor(i / 7) * 0.04)
    expect(isWeightRisingThreeWeeks(logs, today)).toBe(false)
  })

  it('1回でも減っている・変わらずの週があれば false', () => {
    const steps = [0, 0.2, 0.2, 0.2]
    const steps2 = [0, 0.2, 0, 0.2]
    const kg = (s: number[]) => (i: number) => 100 + s.slice(0, Math.floor(i / 7) + 1).reduce((a, b) => a + b, 0)
    expect(isWeightRisingThreeWeeks(daily(from, 28, kg(steps)), today)).toBe(true)
    expect(isWeightRisingThreeWeeks(daily(from, 28, kg(steps2)), today)).toBe(false)
  })

  it('参考値（どれかの7日間が3件未満）や記録が足りないときは false', () => {
    const logs = daily(from, 28, (i) => 100 + Math.floor(i / 7) * 0.2).filter((l, i) => i >= 6 || i === 0) // 最初の7日間は2件だけ
    expect(isWeightRisingThreeWeeks(logs, today)).toBe(false)
    expect(isWeightRisingThreeWeeks(daily(addDaysToDateStr(today, -20), 21, (i) => 100 + i * 0.1), today)).toBe(false)
    expect(isWeightRisingThreeWeeks([], today)).toBe(false)
  })
})

describe('◯月のチート（16章 v2.6）', () => {
  // 2026-11 は30日。朝500・昼700・夜800
  const slotTargets = [
    { slot: 'morning' as const, kcal: 500 },
    { slot: 'lunch' as const, kcal: 700 },
    { slot: 'dinner' as const, kcal: 800 },
  ]
  let seq = 0
  const want = (over: Partial<MonthlyWantRow>): MonthlyWantRow => ({
    id: `w${seq++}`,
    user_id: 'u',
    kind: 'other',
    scheduled_date: null,
    times_per_week: null,
    label: null,
    is_active: true,
    created_at: `2026-11-01T00:00:${String(seq).padStart(2, '0')}Z`,
    cheat_type: 'addon',
    replace_slot: null,
    items: null,
    total_kcal: 280,
    ...over,
  })
  // 食事のチート（品つき）
  const mealCheat = (date: string, slot: 'morning' | 'lunch' | 'dinner', total: number, label = '焼肉') =>
    want({ scheduled_date: date, cheat_type: 'replace', replace_slot: slot, total_kcal: total, label })
  // 追加チート
  const extra = (date: string, total: number, label = 'ビール×2') => want({ scheduled_date: date, total_kcal: total, label })
  const log = (log_date: string, slot: 'morning' | 'lunch' | 'dinner', choice: 'light' | 'normal' | 'hearty') => ({
    log_date,
    slot,
    choice,
  })
  // メシため n 回（その日から1日ずつ、夜に）
  const lights = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => log(addDaysToDateStr(from, i), 'dinner', 'light'))
  const status = (over: Partial<Parameters<typeof calcMonthCheatStatus>[0]>) =>
    calcMonthCheatStatus({
      year: 2026,
      month: 11,
      today: '2026-11-20',
      wants: [],
      mealLogs: [],
      exerciseLogs: [],
      slotTargets,
      ...over,
    })

  describe('食べた分', () => {
    const list = (wants: MonthlyWantRow[], mealLogs: ReturnType<typeof log>[] = [], to = '2026-11-20') =>
      listCheatsInRange({ wants, mealLogs, slotTargets, from: '2026-11-01', to })

    it('食事のチートは 合計 − その食事の目安（下限0）、追加チートは合計そのまま', () => {
      expect(list([mealCheat('2026-11-03', 'dinner', 1200)]).map((c) => c.costKcal)).toEqual([400])
      expect(list([mealCheat('2026-11-03', 'dinner', 500)]).map((c) => c.costKcal)).toEqual([0])
      expect(list([extra('2026-11-03', 280)]).map((c) => c.costKcal)).toEqual([280])
      expect(getCheatPlace({ cheat_type: 'replace', replace_slot: null })).toBe('dinner')
      expect(getCheatPlace({ cheat_type: 'addon', replace_slot: null })).toBe('extra')
      expect(getCheatPlace({ cheat_type: null, replace_slot: null })).toBe('extra')
    })

    it('品を選ばなかった🔥チートは300。同じ食事に品つきのチートがあれば数えない', () => {
      expect(list([], [log('2026-11-05', 'dinner', 'hearty')]).map((c) => [c.kind, c.costKcal])).toEqual([['hearty', 300]])
      const both = list([mealCheat('2026-11-05', 'dinner', 1200)], [log('2026-11-05', 'dinner', 'hearty')])
      expect(both.map((c) => [c.kind, c.costKcal])).toEqual([['cheat', 400]])
      // 同じ日の昼の🔥チートは数える
      expect(list([mealCheat('2026-11-05', 'dinner', 1200)], [log('2026-11-05', 'lunch', 'hearty')])).toHaveLength(2)
    })

    it('今日の予定のチートは数える。明日以降は数えない', () => {
      const s = status({ wants: [extra('2026-11-20', 280), extra('2026-11-21', 500)] })
      expect(s.eatenKcal).toBe(280)
      expect(s.planned.map((p) => p.cheat.date)).toEqual(['2026-11-21'])
    })

    it('頻度ベースのチート・削除したチートはコストに数えない', () => {
      const s = status({ wants: [want({ times_per_week: 3, total_kcal: 500 }), { ...extra('2026-11-03', 280), is_active: false }] })
      expect(s.eatenKcal).toBe(0)
      expect(s.entries).toHaveLength(0)
    })
  })

  describe('なかったことにする順番', () => {
    it('持ち越しが先、日付順、同じ日は朝→昼→夜→追加チート', () => {
      const s = status({
        today: '2026-11-05',
        wants: [
          extra('2026-11-04', 100, 'お菓子'),
          mealCheat('2026-11-04', 'dinner', 1000, '焼肉'),
          extra('2026-11-02', 200, 'ケーキ'),
          mealCheat('2026-11-04', 'morning', 700, 'パンケーキ'),
          extra('2026-10-20', 300, '10月の分'),
        ],
        mealLogs: [log('2026-11-04', 'lunch', 'hearty')],
      })
      expect(s.entries.map((e) => getCheatName(e.cheat))).toEqual([
        '先月の分',
        'ケーキ',
        'パンケーキ',
        '4日の昼のチート',
        '焼肉',
        'お菓子',
      ])
    })

    it('貯めた分を先頭から当て、全額に届いたものが「なかったことに」', () => {
      const s = status({
        wants: [extra('2026-11-02', 200, 'ケーキ'), extra('2026-11-05', 300, 'ポテト')],
        mealLogs: lights('2026-11-06', 2), // 300
      })
      expect(s.entries.map((e) => e.cleared)).toEqual([true, false])
      expect(s.clearedKcal).toBe(300)
    })
  })

  describe('まだの分・余り・メシための回数', () => {
    it('まだの分 = 食べた分 − 貯めた分、回数は切り上げ', () => {
      const s = status({ wants: [extra('2026-11-02', 500)], mealLogs: lights('2026-11-03', 1) })
      expect(s.savedKcal).toBe(150)
      expect(s.pendingKcal).toBe(350)
      expect(s.spareKcal).toBe(0)
      expect(s.tamemeshiNeeded).toBe(3)
    })

    it('余り = 貯めた分 − 食べた分。うごためも貯めた分に入る', () => {
      const s = status({
        wants: [extra('2026-11-02', 200)],
        mealLogs: lights('2026-11-03', 3),
        exerciseLogs: [{ log_date: '2026-11-04', points: 210 }],
      })
      expect(s.savedKcal).toBe(660)
      expect(s.spareKcal).toBe(460)
      expect(s.pendingKcal).toBe(0)
      expect(s.tamemeshiNeeded).toBe(0)
    })

    it('食事のチートがある食事のメシためは貯めた分に入れない', () => {
      const s = status({ wants: [mealCheat('2026-11-03', 'dinner', 1200)], mealLogs: [log('2026-11-03', 'dinner', 'light')] })
      expect(s.savedKcal).toBe(0)
    })
  })

  describe('予定の準備', () => {
    it('余りで足りれば準備OK', () => {
      const s = status({ wants: [mealCheat('2026-11-28', 'dinner', 1000)], mealLogs: lights('2026-11-01', 2) })
      expect(s.planned).toHaveLength(1)
      expect(s.planned[0].ready).toBe(true)
      expect(describePlannedLine(s.planned[0])).toBe('28日の焼肉は、もう準備OK')
    })

    it('足りなければ足りない分を kcal で出す', () => {
      const s = status({ wants: [mealCheat('2026-11-28', 'dinner', 1250)], mealLogs: lights('2026-11-01', 1) })
      expect(s.planned[0].shortKcal).toBe(300)
      expect(s.planned[0].tamemeshiNeeded).toBe(2)
      expect(describePlannedLine(s.planned[0])).toBe('28日の焼肉まで、あと300kcal')
    })

    it('まだの分があるときは、その分も足りない分に入る', () => {
      const s = status({ wants: [extra('2026-11-02', 150), extra('2026-11-25', 150, '予定')] })
      expect(s.planned[0].shortKcal).toBe(300)
    })

    it('予定が複数：日付順に余りを当てていく。翌月の予定は対象にしない', () => {
      const s = status({
        wants: [
          extra('2026-11-28', 300, '焼肉'),
          extra('2026-11-22', 200, 'ケーキ'),
          extra('2026-12-02', 100, '12月の予定'),
        ],
        mealLogs: lights('2026-11-01', 2), // 余り300
      })
      expect(s.planned.map((p) => [getCheatName(p.cheat), p.ready, p.shortKcal])).toEqual([
        ['ケーキ', true, 0],
        ['焼肉', false, 200],
      ])
    })
  })

  describe('持ち越し（16-追記 v2.6.1）', () => {
    const octCheat = extra('2026-10-25', 600, '10月の飲み会')
    const base = { wants: [octCheat], mealLogs: lights('2026-10-26', 2) } // 10月：600 − 300 = 300 のまだの分
    const carry = (over: Partial<Parameters<typeof calcCarryover>[0]>) =>
      calcCarryover({ year: 2026, month: 11, today: '2026-11-05', slotTargets, wants: [], mealLogs: [], exerciseLogs: [], ...over })

    it('月末のまだの分が翌月に「先月の分」として入る', () => {
      expect(carry(base)).toEqual({ kcal: 300 })
      const s = status({ today: '2026-11-05', ...base })
      expect(s.carryoverKcal).toBe(300)
      expect(s.eatenKcal).toBe(300)
      expect(s.stage).toBe('pending')
      expect(getCheatName(s.entries[0].cheat)).toBe('先月の分')
      expect(hasMonthCheats(s)).toBe(false)
    })

    it('8日以降も残り、月末までのメシため・うごためで当てられる', () => {
      const day20 = status({ today: '2026-11-20', ...base })
      expect(day20.carryoverKcal).toBe(300)
      expect(day20.pendingKcal).toBe(300)
      const mealLogs = [...base.mealLogs, ...lights('2026-11-25', 1)]
      const exerciseLogs = [{ log_date: '2026-11-28', points: 150 }]
      const day30 = status({ today: '2026-11-30', wants: base.wants, mealLogs, exerciseLogs })
      expect(day30.carryoverKcal).toBe(300)
      expect(day30.pendingKcal).toBe(0)
      expect(day30.entries[0].cleared).toBe(true)
    })

    it('翌月末に残った持ち越しは、翌々月に入らない', () => {
      // 10月のまだの分300が11月に入り、11月は貯めた分0 → 12月には持ち越さない
      const dec = calcMonthCheatStatus({ year: 2026, month: 12, today: '2026-12-03', slotTargets, exerciseLogs: [], ...base })
      expect(dec.carryoverKcal).toBe(0)
      expect(dec.entries).toHaveLength(0)
    })

    it('持ち越す量 = max(0, その月のチート − max(0, 貯めた分 − 前月からの持ち越し))', () => {
      // 10月→11月に300持ち越し。11月のチート500
      const nov = extra('2026-11-10', 500, '11月の飲み会')
      const dec = (mealLogs: { log_date: string; slot: 'morning' | 'lunch' | 'dinner'; choice: 'light' | 'normal' | 'hearty' }[]) =>
        calcCarryover({ year: 2026, month: 12, today: '2026-12-03', slotTargets, wants: [octCheat, nov], exerciseLogs: [], mealLogs: [...base.mealLogs, ...mealLogs] })
      // 持ち越しを返しきれなかった月：11月に150 → 500 − max(0, 150 − 300) = 500
      expect(dec(lights('2026-11-11', 1))).toEqual({ kcal: 500 })
      // ちょうど返しきった月：11月に300 → 500 − 0 = 500
      expect(dec(lights('2026-11-11', 2))).toEqual({ kcal: 500 })
      // 余りがあった月：11月に600 → 500 − 300 = 200
      expect(dec(lights('2026-11-11', 4))).toEqual({ kcal: 200 })
      // 11月のチートを全部返せた：11月に900 → 0
      expect(dec(lights('2026-11-11', 6))).toEqual({ kcal: 0 })
    })

    it('余りは持ち越さない', () => {
      const spare = status({ today: '2026-11-03', wants: [extra('2026-10-25', 100)], mealLogs: lights('2026-10-26', 3) })
      expect(spare.carryoverKcal).toBe(0)
      expect(spare.savedKcal).toBe(0)
      expect(spare.eatenKcal).toBe(0)
    })

    it('1月は前の年の12月から持ち越す', () => {
      const c = calcCarryover({
        year: 2027, month: 1, today: '2027-01-02', slotTargets, exerciseLogs: [], mealLogs: [], wants: [extra('2026-12-31', 280)],
      })
      expect(c.kcal).toBe(280)
    })

    it('読み込み開始日は3か月前の月の初日', () => {
      expect(getCheatLoadFrom(2026, 11)).toBe('2026-08-01')
      expect(getCheatLoadFrom(2027, 2)).toBe('2026-11-01')
    })
  })

  describe('カード（16-追記 v2.6.2）', () => {
    const item = (genre: string, name: string, kcal: number, qty = 1) => ({ genre, name, kcal, qty })
    const withItems = (date: string, items: ReturnType<typeof item>[]) =>
      want({ scheduled_date: date, items, total_kcal: items.reduce((x, i) => x + i.kcal * i.qty, 0) })

    describe('換算', () => {
      it('その月にいちばん多く（kcal×数量で）食べた品で換算し、四捨五入して「約」', () => {
        const s = status({
          wants: [
            withItems('2026-11-02', [item('alcohol', 'ビール350ml', 140, 3)]), // 420
            withItems('2026-11-05', [item('ramen', '家系', 950)]), // 950
            withItems('2026-11-09', [item('alcohol', 'ビール350ml', 140, 2)]), // 280 → ビール 700
          ],
        })
        // ラーメン（家系）が950でいちばん多い。合計1,650 ÷ 950 = 1.7 → 約2杯
        expect(pickCheatEquivalent(s)).toEqual({ name: '家系ラーメン', unit: '杯', count: 2, drink: false })
      })

      it('お酒のジャンルなら「飲んで」「飲みました」', () => {
        const s = status({ wants: [withItems('2026-11-02', [item('alcohol', 'ビール350ml', 140, 40)])] })
        const eq = pickCheatEquivalent(s)
        expect(eq).toEqual({ name: 'ビール', unit: '缶', count: 40, drink: true })
        expect(describeCheatHeadline(eq, -0.4)).toBe('ビール約40缶ぶん飲んで、月初めから0.4kg減')
        expect(describeCheatHeadline(eq, 0.3)).toBe('ビール約40缶ぶん飲みました')
        expect(describeCheatHeadline(eq, 0)).toBe('ビール約40缶ぶん飲んで、体重はそのまま')
      })

      it('品なしの🔥チートだけならラーメンで換算', () => {
        const s = status({ mealLogs: [log('2026-11-02', 'dinner', 'hearty'), log('2026-11-03', 'dinner', 'hearty')] })
        expect(pickCheatEquivalent(s)).toEqual({ name: 'ラーメン', unit: '杯', count: 1, drink: false }) // 600 ÷ 500 = 1.2
      })

      it('自由入力の品は換算に使わない（なければラーメン）', () => {
        const s = status({ wants: [withItems('2026-11-02', [item('sweets', '手作りクッキー', 1000)])] })
        expect(pickCheatEquivalent(s)?.name).toBe('ラーメン')
      })

      it('四捨五入（0.5は切り上げ）。0になるときは約1', () => {
        expect(pickCheatEquivalent(status({ wants: [extra('2026-11-02', 750)] }))?.count).toBe(2) // 750 ÷ 500 = 1.5
        expect(pickCheatEquivalent(status({ wants: [extra('2026-11-02', 100)] }))?.count).toBe(1)
      })

      it('チートが0なら行なし', () => {
        const s = status({ mealLogs: lights('2026-11-03', 2) })
        expect(pickCheatEquivalent(s)).toBeNull()
        expect(describeCheatHeadline(pickCheatEquivalent(s), -0.4)).toBeNull()
      })
    })

    describe('体重の部分', () => {
      const eq = { name: 'ラーメン', unit: '杯', count: 3, drink: false }
      it('減っていれば「、月初めから0.4kg減」', () => {
        expect(describeCheatHeadline(eq, -0.4)).toBe('ラーメン約3杯ぶん食べて、月初めから0.4kg減')
      })
      it('変わらずなら「、体重はそのまま」', () => {
        expect(describeCheatHeadline(eq, 0.04)).toBe('ラーメン約3杯ぶん食べて、体重はそのまま')
      })
      it('増えているときは体重の部分を出さない', () => {
        expect(describeCheatHeadline(eq, 0.2)).toBe('ラーメン約3杯ぶん食べました')
      })
      it('計算できないときは体重の部分を出さない', () => {
        expect(describeCheatHeadline(eq, null)).toBe('ラーメン約3杯ぶん食べました')
      })
    })

    describe('棒', () => {
      it('足りない部分：どんなに小さくても8%以上', () => {
        expect(calcCheatCardBar(5670, 5535)).toEqual({ kind: 'short', filled: 0.92, short: 0.08, over: 0, markerAt: null })
        const big = calcCheatCardBar(1000, 400)!
        expect(big.short).toBeCloseTo(0.6)
        expect(big.filled).toBeCloseTo(0.4)
        expect(describeShortLabel(135)).toBe('あと135kcal')
      })

      it('超えた部分：チートの位置に縦線、その先が超えた部分', () => {
        const bar = calcCheatCardBar(4500, 6000)!
        expect(bar.kind).toBe('over')
        expect(bar.markerAt).toBeCloseTo(0.75)
        expect(bar.filled).toBeCloseTo(0.75)
        expect(bar.over).toBeCloseTo(0.25)
      })

      it('ちょうど同じ：右端に縦線', () => {
        expect(calcCheatCardBar(300, 300)).toEqual({ kind: 'exact', filled: 1, short: 0, over: 0, markerAt: 1 })
      })

      it('貯めた分0：全部が足りない部分', () => {
        expect(calcCheatCardBar(300, 0)).toEqual({ kind: 'short', filled: 0, short: 1, over: 0, markerAt: null })
      })

      it('チート0で貯めた分だけ：全部が超えた部分で、縦線なし。両方0なら棒なし', () => {
        expect(calcCheatCardBar(0, 300)).toEqual({ kind: 'over', filled: 0, short: 0, over: 1, markerAt: null })
        expect(calcCheatCardBar(0, 0)).toBeNull()
      })

      it('貯めた分の回数：メシためとうごため', () => {
        const s = status({
          mealLogs: lights('2026-11-03', 5),
          exerciseLogs: [{ log_date: '2026-11-04', points: 100 }, { log_date: '2026-11-05', points: 50 }],
        })
        expect(s.earned.tamemeshiCount).toBe(5)
        expect(s.earned.exerciseCount).toBe(2)
      })
    })

    describe('いちばん手軽に届く方法', () => {
      it('300kcal以下はウォーキングの分数を10分単位で切り上げ', () => {
        expect(pickEasiestWay(135)).toEqual({ type: 'walking', minutes: 30 }) // 27分 → 30分
        expect(pickEasiestWay(150)).toEqual({ type: 'walking', minutes: 30 })
        expect(pickEasiestWay(151)).toEqual({ type: 'walking', minutes: 40 })
        expect(pickEasiestWay(300)).toEqual({ type: 'walking', minutes: 60 })
        expect(describeEasiestWay({ type: 'walking', minutes: 30 })).toBe('🚶 30分歩けば、なかったことに')
      })

      it('300kcalより多いとき・まだの分0のときは出さない', () => {
        expect(pickEasiestWay(301)).toBeNull()
        expect(pickEasiestWay(0)).toBeNull()
      })
    })

    describe('カードの一番下の行（16-追記 v2.6.3）', () => {
      it('300kcal以下：歩く分数と［記録する］', () => {
        expect(describeCardWayLine(135)).toEqual({ text: '🚶 30分歩けば、なかったことに', walkMinutes: 30 })
        expect(describeCardWayLine(300)).toEqual({ text: '🚶 60分歩けば、なかったことに', walkMinutes: 60 })
      })

      it('300kcalより多い：「どうやって届く？」', () => {
        expect(describeCardWayLine(301)).toEqual({ text: 'どうやって届く？', walkMinutes: null })
      })

      it('まだの分0：出さない', () => {
        expect(describeCardWayLine(0)).toBeNull()
      })

      describe('チートの kcal の横の ✓（16-追記 v2.6.5）', () => {
        it('貯めた分がチートより多い：出す。棒は縦線とその先の淡い部分のまま', () => {
          const s = status({ wants: [extra('2026-11-02', 200)], mealLogs: lights('2026-11-03', 3) })
          expect(s.spareKcal).toBe(250)
          expect(isCheatCovered(s)).toBe(true)
          expect(describeCardWayLine(s.pendingKcal)).toBeNull()
          expect(calcCheatCardBar(s.eatenKcal, s.savedKcal)!.kind).toBe('over')
        })

        it('ちょうど同じ：出す', () => {
          const s = status({ wants: [extra('2026-11-02', 300)], mealLogs: lights('2026-11-03', 2) })
          expect(s.eatenKcal).toBe(300)
          expect(s.savedKcal).toBe(300)
          expect(isCheatCovered(s)).toBe(true)
          expect(calcCheatCardBar(s.eatenKcal, s.savedKcal)!.kind).toBe('exact')
        })

        it('貯めた分がチートより少ない：出さない', () => {
          const s = status({ wants: [extra('2026-11-02', 400)], mealLogs: lights('2026-11-03', 1) })
          expect(s.pendingKcal).toBe(250)
          expect(isCheatCovered(s)).toBe(false)
        })

        it('チート0：貯めた分があっても出さない。一番下の行もなし', () => {
          const s = status({ mealLogs: lights('2026-11-03', 2) })
          expect(s.eatenKcal).toBe(0)
          expect(isCheatCovered(s)).toBe(false)
          expect(describeCardWayLine(s.pendingKcal)).toBeNull()
          expect(isCheatCovered(status({}))).toBe(false)
        })
      })
    })

    describe('記録のトースト（16-追記 v2.6.3）', () => {
      const meshitame = { kind: 'meshitame' } as const
      const walk30 = { kind: 'exercise', log: { exercise_type: 'walking', minutes: 30, steps: null, points: 150 } } as const
      const walk30Log = { log_date: '2026-11-20', points: 150 }

      it('まだの分が残る：「あと◯kcalです」', () => {
        const wants = [extra('2026-11-02', 465)]
        const before = status({ wants, mealLogs: lights('2026-11-03', 1) }) // 315
        const after = status({ wants, mealLogs: lights('2026-11-03', 2) }) // 165
        expect(describeRecordToast(meshitame, before, after)).toBe('🐷 メシため。あと165kcalです')
        const afterWalk = status({ wants, mealLogs: lights('2026-11-03', 1), exerciseLogs: [walk30Log] })
        expect(describeRecordToast(walk30, before, afterWalk)).toBe('🏃 うごため 30分。あと165kcalです')
      })

      it('まだの分が0になる：「{チート名}、なかったことに。」', () => {
        const wants = [extra('2026-11-02', 300, 'ビール×2')]
        const before = status({ wants, mealLogs: lights('2026-11-03', 1) })
        const after = status({ wants, mealLogs: lights('2026-11-03', 2) })
        expect(describeRecordToast(meshitame, before, after)).toBe('ビール×2、なかったことに。')
        const afterWalk = status({ wants, mealLogs: lights('2026-11-03', 1), exerciseLogs: [walk30Log] })
        expect(describeRecordToast(walk30, before, afterWalk)).toBe('ビール×2、なかったことに。')
      })

      it('今月のチートがぜんぶなかったことになっている：「今月のチートは、ぜんぶなかったことに。」（16-追記 v2.6.4）', () => {
        const wants = [extra('2026-11-02', 140)]
        const before = status({ wants, mealLogs: lights('2026-11-03', 7) })
        const after = status({ wants, mealLogs: lights('2026-11-03', 8) }) // 1,200 − 140
        expect(describeRecordToast(meshitame, before, after)).toBe('🐷 メシため。今月のチートは、ぜんぶなかったことに。')
        const afterWalk = status({ wants, mealLogs: lights('2026-11-03', 7), exerciseLogs: [walk30Log] })
        expect(describeRecordToast(walk30, before, afterWalk)).toBe('🏃 うごため 30分。今月のチートは、ぜんぶなかったことに。')
        expect(describeRecordToast(meshitame, before, after)).not.toContain('使え')
      })

      it('今月のチートも予定もない：換算のまま', () => {
        const before = status({})
        expect(describeRecordToast(meshitame, before, status({ mealLogs: lights('2026-11-03', 1) }))).toBe(
          '🐷 メシため。ビール1本ぶんです'
        )
        expect(describeRecordToast(walk30, before, status({ exerciseLogs: [walk30Log] }))).toBe(
          '🏃 うごため 30分。ビール1本ぶんです'
        )
      })

      it('今月のチートはなく、今日より後に予定がある：予定の行と同じ計算', () => {
        const wants = [extra('2026-11-28', 450, '焼肉')]
        const before = status({ wants })
        const after = status({ wants, mealLogs: lights('2026-11-03', 1) })
        expect(describeRecordToast(meshitame, before, after)).toBe('🐷 メシため。28日の焼肉まで、あと300kcalです')
        const afterWalk = status({ wants, exerciseLogs: [walk30Log] })
        expect(describeRecordToast(walk30, before, afterWalk)).toBe('🏃 うごため 30分。28日の焼肉まで、あと300kcalです')
        const ready = status({ wants, mealLogs: lights('2026-11-03', 3) })
        expect(describeRecordToast(meshitame, before, ready)).toBe('🐷 メシため。28日の焼肉は、もう準備OKです')
      })
    })

    describe('ヒント', () => {
      it('メシため・ウォーキング・ランニング・歩数の数（切り上げ）', () => {
        expect(buildCheatHints(1200)).toEqual({
          pendingKcal: 1200,
          tamemeshiCount: 8,
          walkingMinutes: 240,
          walking30Count: 8,
          runningMinutes: 120,
          steps: 35000, // 34,286歩 → 1万歩以上は千歩単位で切り上げ
        })
        const small = buildCheatHints(290)!
        expect(small.tamemeshiCount).toBe(2)
        expect(small.walkingMinutes).toBe(58)
        expect(small.runningMinutes).toBe(29)
        expect(small.steps).toBe(8300) // 8,286歩 → 100歩単位で切り上げ
      })

      it('時間と歩数のまとめ方', () => {
        expect(formatDurationMinutes(45)).toBe('45分')
        expect(formatDurationMinutes(60)).toBe('1時間')
        expect(formatDurationMinutes(90)).toBe('1時間30分')
        expect(formatDurationMinutes(240)).toBe('4時間')
        expect(formatSteps(8300)).toBe('8,300歩')
        expect(formatSteps(35000)).toBe('3万5千歩')
        expect(formatSteps(20000)).toBe('2万歩')
      })

      it('まだの分0なら出さない', () => {
        expect(buildCheatHints(0)).toBeNull()
      })
    })

    it('「今日うごく？」の上の記録したもの', () => {
      const ex = (exercise_type: ExerciseLogRow['exercise_type'], minutes: number | null, steps: number | null, created_at: string) => ({
        exercise_type, minutes, steps, created_at,
      })
      expect(describeDayExercises([])).toBeNull()
      expect(
        describeDayExercises([ex('steps', null, 8000, '2026-11-02T10:00:00Z'), ex('walking', 30, null, '2026-11-02T08:00:00Z')])
      ).toBe('🚶30分・👣8,000歩')
    })
  })

  describe('順調・カードの状態', () => {
    it('食べた分0のときは順調にしない。まだの分0で順調', () => {
      expect(status({ mealLogs: lights('2026-11-01', 3) }).onTrack).toBe(false)
      expect(status({ wants: [extra('2026-11-02', 300)], mealLogs: lights('2026-11-03', 2) }).onTrack).toBe(true)
      expect(status({ wants: [extra('2026-11-02', 300)], mealLogs: lights('2026-11-03', 1) }).onTrack).toBe(false)
    })

    it('A：まだの分がある / B：ぜんぶ済みで余りがある / C：食べた分も余りもない', () => {
      expect(status({}).stage).toBe('empty')
      expect(status({ wants: [extra('2026-11-02', 300)] }).stage).toBe('pending')
      expect(status({ wants: [extra('2026-11-02', 300)], mealLogs: lights('2026-11-03', 3) }).stage).toBe('spare')
      expect(status({ mealLogs: lights('2026-11-03', 1) }).stage).toBe('spare') // 食べた分なし・余りあり
      expect(status({ wants: [extra('2026-11-02', 300)], mealLogs: lights('2026-11-03', 2) }).stage).toBe('empty') // ちょうど
    })
  })

  it('新たになかったことになったチート（最後の1件）', () => {
    const wants = [extra('2026-11-02', 150, 'ケーキ'), extra('2026-11-03', 150, 'ポテト')]
    const before = status({ wants, mealLogs: lights('2026-11-04', 1) })
    const after = status({ wants, mealLogs: lights('2026-11-04', 2) })
    expect(getCheatName(detectNewlyCleared(before, after)!)).toBe('ポテト')
    expect(detectNewlyCleared(after, after)).toBeNull()
  })

  it('品の絵文字（同じ絵文字は1つ）', () => {
    expect(
      getCheatItemEmojis([
        want({ items: [{ genre: 'ramen', name: '家系', kcal: 900, qty: 1 }, { genre: 'alcohol', name: 'ビール', kcal: 140, qty: 2 }] }),
        want({ items: [{ genre: 'alcohol', name: 'ハイボール', kcal: 70, qty: 1 }] }),
      ])
    ).toBe('🍜🍺')
  })

  it('貯めた分：メシため×150 ＋ うごため。いつもの・🔥チートは0、他の月の分は入らない', () => {
    const input = {
      year: 2026, month: 11, today: '2026-11-10',
      mealLogs: [
        log('2026-11-02', 'lunch', 'light'),
        log('2026-11-03', 'morning', 'light'),
        log('2026-11-04', 'morning', 'normal'),
        log('2026-11-06', 'dinner', 'hearty'),
        log('2026-10-31', 'dinner', 'light'),
      ],
      exerciseLogs: [{ log_date: '2026-11-07', points: 150 }, { log_date: '2026-10-30', points: 999 }],
    }
    expect(calcMonthEarnedBreakdown(input)).toEqual({ tamemeshiCount: 2, tamemeshiPt: 300, exerciseCount: 1, exercisePt: 150, totalPt: 450 })
  })

  it('食事のチートのある食事だけが対象。追加チート・頻度ベースは対象にしない', () => {
    const keys = getReplacedMealKeys([
      mealCheat('2026-11-03', 'lunch', 900),
      extra('2026-11-03', 280),
      want({ times_per_week: 1, cheat_type: 'replace', replace_slot: 'dinner' }),
    ])
    expect([...keys]).toEqual(['2026-11-03:lunch'])
    const hearty = expandHeartyCheats(
      [log('2026-11-03', 'lunch', 'hearty'), log('2026-11-03', 'dinner', 'hearty'), log('2026-11-01', 'morning', 'hearty')],
      '2026-11-01',
      '2026-11-30',
      keys
    )
    expect(hearty.map((h) => `${h.date}:${h.slot}`)).toEqual(['2026-11-01:morning', '2026-11-03:dinner'])
  })

  it('トースト：符号つきの数字を出さない', () => {
    expect(describeMeshitameToast()).toBe('🐷 メシため。ビール1本ぶんです')
    expect(describeExerciseToast({ exercise_type: 'walking', minutes: 30, steps: null, points: 150 })).toBe(
      '🏃 うごため 30分。ビール1本ぶんです'
    )
    expect(describeExerciseToast({ exercise_type: 'steps', minutes: null, steps: 8000, points: 280 })).toBe(
      '🏃 うごため 8,000歩。ケーキ1個ぶんです'
    )
    expect(describeExerciseToast({ exercise_type: 'walking', minutes: 10, steps: null, points: 50 })).toBe('🏃 うごため 10分。')
  })

  describe('いつものうごため（16-追記 v2.6.4）', () => {
    const ex = (
      log_date: string,
      exercise_type: ExerciseLogRow['exercise_type'],
      minutes: number | null,
      created_at = `${log_date}T09:00:00Z`
    ) => ({ log_date, exercise_type, minutes, created_at })
    const today = '2026-11-20'

    it('種類ごとに数え、回数の多い種類から2つ', () => {
      const logs = [
        ex('2026-11-10', 'running', 20),
        ex('2026-11-11', 'running', 30), // 時間が違っても同じ種類として数える
        ex('2026-11-12', 'running', 20),
        ex('2026-11-12', 'weights', 45),
        ex('2026-11-13', 'weights', 45),
        ex('2026-11-15', 'walking', 30),
      ]
      expect(pickFrequentExercises(logs, today)).toEqual([
        { type: 'running', minutes: 20 },
        { type: 'weights', minutes: 45 },
      ])
    })

    it('同じ種類は1つだけ（いちばん多い組み合わせが同じ種類で2つあっても）', () => {
      const logs = [
        ex('2026-11-10', 'walking', 30),
        ex('2026-11-11', 'walking', 30),
        ex('2026-11-12', 'walking', 45),
        ex('2026-11-13', 'walking', 45),
        ex('2026-11-14', 'cycling', 40),
      ]
      const picked = pickFrequentExercises(logs, today)
      expect(picked.map((p) => p.type)).toEqual(['walking', 'cycling'])
    })

    it('分数はその種類でいちばん多く記録した分数。同じ回数なら新しいほう', () => {
      const logs = [
        ex('2026-11-10', 'walking', 30),
        ex('2026-11-11', 'walking', 45),
        ex('2026-11-12', 'walking', 45),
        ex('2026-11-13', 'running', 20),
        ex('2026-11-16', 'running', 30), // 20分と30分が1回ずつ → 新しい30分
      ]
      expect(pickFrequentExercises(logs, today)).toEqual([
        { type: 'walking', minutes: 45 },
        { type: 'running', minutes: 30 },
      ])
    })

    it('同じ回数の種類なら、最後に記録した日が新しいほうが先', () => {
      const logs = [
        ex('2026-11-10', 'cycling', 40),
        ex('2026-11-18', 'running', 20),
        ex('2026-11-12', 'sports', 60),
        ex('2026-11-19', 'cycling', 40, '2026-11-19T07:00:00Z'),
        ex('2026-11-19', 'sports', 60, '2026-11-19T08:00:00Z'),
        ex('2026-11-11', 'running', 20),
      ]
      expect(pickFrequentExercises(logs, today)).toEqual([
        { type: 'sports', minutes: 60 },
        { type: 'cycling', minutes: 40 },
      ])
    })

    it('歩数の記録と、30日より前の記録は数えない', () => {
      const logs = [
        ex('2026-11-15', 'steps', null),
        ex('2026-11-16', 'steps', null),
        ex('2026-10-21', 'cycling', 40), // 30日前（数えない）
        ex('2026-10-22', 'sports', 60), // 今日を含めて30日目（数える）
      ]
      expect(pickFrequentExercises(logs, today)).toEqual([
        { type: 'sports', minutes: 60 },
        { type: 'walking', minutes: 30 },
      ])
    })

    it('記録がなければ ウォーキング30分・ランニング30分', () => {
      expect(pickFrequentExercises([], today)).toEqual([
        { type: 'walking', minutes: 30 },
        { type: 'running', minutes: 30 },
      ])
    })

    it('足りないときの埋め方：すでに出ている種類は飛ばす', () => {
      // ウォーキング45分があるので、ウォーキング30分は足さない
      expect(pickFrequentExercises([ex('2026-11-15', 'walking', 45)], today)).toEqual([
        { type: 'walking', minutes: 45 },
        { type: 'running', minutes: 30 },
      ])
      expect(pickFrequentExercises([ex('2026-11-15', 'running', 20)], today)).toEqual([
        { type: 'running', minutes: 20 },
        { type: 'walking', minutes: 30 },
      ])
    })
  })

  it('よく食べるもの：直近60日の回数の多い順に6つまで。頻度ベースの品も入れる', () => {
    const it = (name: string) => ({ genre: 'alcohol', name, kcal: 100, qty: 1 })
    const rows = [
      want({ scheduled_date: '2026-11-10', items: [it('ビール'), it('ハイボール')] }),
      want({ scheduled_date: '2026-11-12', items: [it('ハイボール')] }),
      want({ scheduled_date: '2026-09-01', items: [it('古い')] }), // 60日より前
      want({ scheduled_date: '2026-11-25', items: [it('先の予定')] }), // 今日より後
      want({ times_per_week: 2, items: [it('晩酌')] }),
      { ...want({ scheduled_date: '2026-11-11', items: [it('取り消し')] }), is_active: false },
      ...['a', 'b', 'c', 'd'].map((n) => want({ scheduled_date: '2026-11-13', items: [it(n)] })),
    ]
    const picked = pickFrequentCheatItems(rows, '2026-11-20')
    expect(picked.map((p) => p.name)).toEqual(['ハイボール', 'ビール', '晩酌', 'a', 'b', 'c'])
    expect(picked[0]).toEqual({ genre: 'alcohol', name: 'ハイボール', kcal: 100 })
  })
})
