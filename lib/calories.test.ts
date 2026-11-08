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
