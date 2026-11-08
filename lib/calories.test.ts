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
  calcMeshipoGauge,
  calcExercisePoints,
  addDaysToDateStr,
  getRecordableDateRange,
  isRecordableDate,
  formatMonthDayWeekday,
  parseWeightInput,
  calcWeightAverage,
  calcWeekOverWeek,
  formatSignedKg,
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
} from '@/lib/calories'
import type { MonthlyWantRow, WantEntry } from '@/types'
import { CHEAT_ITEMS } from '@/lib/cheatItems'

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

  it('TDEE − 基礎代謝 − 150 で頭打ち（目安パターンが基礎代謝を下回らない）', () => {
    // 活動少なめ：BMR 2109 / TDEE 2531 → 上限 272
    const bmr = calcBaseMetabolism(104, 178, 40, 'male')
    const tdee = calcTDEE(bmr, 'low')
    const r = calcDailySaving(1.75, 2026, 11, tdee, bmr)
    expect(r.capKcal).toBe(tdee - bmr - 150)
    expect(r.savingKcal).toBe(r.capKcal)
    expect(r.capped).toBe(true)
    expect(calcDailyIntakeTarget(tdee, r.savingKcal, bmr) - 150).toBe(bmr)
  })

  it('TDEE − 基礎代謝が150未満なら貯金0', () => {
    expect(calcDailySaving(1, 2026, 11, 2100, 2000).savingKcal).toBe(0)
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
  it('朝昼夜の合計は目安 − 150', () => {
    const slots = calcMealSlotTargets(2000)
    expect(slots.map((s) => s.slot)).toEqual(['morning', 'lunch', 'dinner'])
    expect(slots.reduce((sum, s) => sum + s.kcal, 0)).toBe(1850)
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

  it('がっつりに目安+300未満のメニューは入らない（境界）', () => {
    const menu = [
      { name: 'a', kcal: 1382, genre: 'gaishoku' as const, slots: ['dinner' as const] },
      { name: 'b', kcal: 1383, genre: 'gaishoku' as const, slots: ['dinner' as const] },
    ]
    expect(pickMealExamples('dinner', 1083, menu).hearty.map((m) => m.name)).toEqual(['b'])
  })

  it('その食事のメニューだけを出す', () => {
    const { normal, hearty } = pickMealExamples('morning', 450)
    for (const m of [...normal, ...hearty]) expect(m.slots).toContain('morning')
  })

  it('ジャンルが混ざる（同じジャンルばかりにならない）', () => {
    const { normal } = pickMealExamples('lunch', 700)
    expect(new Set(normal.map((m) => m.genre)).size).toBeGreaterThanOrEqual(3)
  })

  it('1日の目安1300〜3300kcalのどこでも、両方3〜5個出る', () => {
    for (let d = 1300; d <= 3300; d += 25) {
      for (const t of calcMealSlotTargets(d)) {
        const { normal, hearty } = pickMealExamples(t.slot, t.kcal)
        expect(normal.length, `${d} ${t.slot} 目安くらい`).toBeGreaterThanOrEqual(3)
        expect(hearty.length, `${d} ${t.slot} がっつり`).toBeGreaterThanOrEqual(3)
        expect(normal.length).toBeLessThanOrEqual(5)
        expect(hearty.length).toBeLessThanOrEqual(5)
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

  it('換算：750pt = 軽め5回 or ウォーキング150分', () => {
    expect(convertCheatCost(750)).toEqual({ lightMeals: 5, walkingMinutes: 150 })
    expect(convertCheatCost(117)).toEqual({ lightMeals: 1, walkingMinutes: 24 })
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

  it('貯まったpt = 経過日数×150 + 軽め+150 / がっつり−300 + 運動', () => {
    const earned = calcMonthEarnedPt({
      year: 2026, month: 11, today: '2026-11-10',
      mealLogs: [
        { log_date: '2026-11-02', slot: 'lunch', choice: 'light' },
        { log_date: '2026-11-03', slot: 'dinner', choice: 'hearty' },
        { log_date: '2026-11-04', slot: 'morning', choice: 'normal' },
      ],
      exerciseLogs: [],
    })
    expect(earned).toBe(10 * 150 + 150 - 300)
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
    expect(spread).toBe(1500 + 485)
    expect(spread).toBe(sameDay)
  })

  it('夜を置き換えた日に夜の記録が「がっつり」で残っていても、−300されない', () => {
    const cheat = ramen700('2026-11-03')
    const mealLogs = [{ log_date: '2026-11-03', slot: 'dinner' as const, choice: 'hearty' as const }]
    const base = { year: 2026, month: 11, today: '2026-11-10', mealLogs, exerciseLogs: [] }
    expect(calcMonthEarnedPt({ ...base, replacedMealKeys: getReplacedMealKeys([cheat]) })).toBe(1500)
    // 置き換えのない食事（同じ日の昼）は数える
    const lunch = [...mealLogs, { log_date: '2026-11-03', slot: 'lunch' as const, choice: 'hearty' as const }]
    expect(calcMonthEarnedPt({ ...base, mealLogs: lunch, replacedMealKeys: getReplacedMealKeys([cheat]) })).toBe(1200)
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

  it('軽めの必要回数：見込みで足りれば0（今月は軽めなしでOK）、足りなければ切り上げ', () => {
    // 見込み = 1000 + 20日×150 = 4000
    expect(calcMeshipoGauge({ targetPt: 3300, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 }).lightMealsNeeded).toBe(0)
    expect(calcMeshipoGauge({ targetPt: 4000, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 }).lightMealsNeeded).toBe(0)
    expect(calcMeshipoGauge({ targetPt: 4001, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 }).lightMealsNeeded).toBe(1)
    expect(calcMeshipoGauge({ targetPt: 4450, earnedPt: 1000, dayOfMonth: 10, daysInMonth: 30 }).lightMealsNeeded).toBe(3)
    // 目標0（チートなし）でも0回
    expect(calcMeshipoGauge({ targetPt: 0, earnedPt: 0, dayOfMonth: 1, daysInMonth: 30 }).lightMealsNeeded).toBe(0)
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
    expect(nov).toBe(3 * 150 + 150)
    const oct = calcMonthEarnedPt({ year: 2026, month: 10, today: '2026-11-03', mealLogs, exerciseLogs })
    expect(oct).toBe(31 * 150 + 150 + 150)
  })

  it('何も記録しない日は目安どおり（経過日数×150だけ貯まる）', () => {
    expect(calcMonthEarnedPt({ year: 2026, month: 11, today: '2026-11-08', mealLogs: [], exerciseLogs: [] })).toBe(1200)
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

describe('formatSignedKg', () => {
  it('0.1kg単位で符号つき。0は ±0.0kg', () => {
    expect(formatSignedKg(-0.44)).toBe('−0.4kg')
    expect(formatSignedKg(0.25)).toBe('+0.3kg')
    expect(formatSignedKg(-0.04)).toBe('±0.0kg')
  })
})

describe('月の割り直し（11-3）', () => {
  // 104kg・12ヶ月で15kg → ゲート1 −5.25kg（98.75kg）、ゲート2 −4.5kg（94.25kg）…
  // 上限 = min(750, 2800 − 2000 − 150) = 650kcal
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
    // ゲート1の最終月に104kgのまま → 5.25kg ÷ 1ヶ月 → 1219kcal/日 > 上限650
    const t = decideMonthTargets(plan, 2027, 1, avg(104))
    expect(t.dailySaving.capped).toBe(true)
    expect(t.dailySaving.savingKcal).toBe(650)
    expect(t.dailySaving.uncappedKcal).toBe(1219)
    // （1219 − 650）× 31日 × 1ヶ月 ÷ 7200
    expect(t.shortfallKg).toBeCloseTo((569 * 31) / 7200)
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
