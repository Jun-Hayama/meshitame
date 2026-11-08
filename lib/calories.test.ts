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
  calcWeeklyWantSaving,
  calcWeeklyBudget,
  sumWantCosts,
  calcLightMealCount,
  calcWantGauges,
  calcRecoveryOptions,
  getDaysInMonth,
  expandMonthlyWantsForWeek,
  buildMealPatterns,
  sumMealLogDelta,
  countLightMealLogs,
} from '@/lib/calories'
import type { WantEntry } from '@/types'

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

describe('仕様の例：飲み会1回＋ラーメン1回で軽め3回', () => {
  const wants: WantEntry[] = [
    { id: 'r', kind: 'ramen', date: '2026-11-07' },
    { id: 'n', kind: 'drinking_party', date: '2026-11-05' },
  ]

  it('7日の週の欲望貯金は1050kcal', () => {
    expect(calcWeeklyWantSaving(nov(4))).toBe(1050)
  })

  it('1500kcal − 1050kcal = 不足450kcal → 軽め3回', () => {
    expect(sumWantCosts(wants)).toBe(1500)
    const result = calcLightMealCount(1500, 1050)
    expect(result.shortfallKcal).toBe(450)
    expect(result.count).toBe(3)
    expect(result.exceedsWeeklyMax).toBe(false)
  })

  it('ゲージは週のはじめ ★ラーメンまで 0/450kcal（飲み会は週の欲望貯金で満タン）', () => {
    const { gauges, bonusKcal } = calcWantGauges(wants, 1050, 0)
    expect(gauges.map((g) => g.want.id)).toEqual(['n', 'r'])
    expect(gauges[0]).toMatchObject({ targetKcal: 0, currentKcal: 0, achieved: true })
    expect(gauges[1]).toMatchObject({
      targetKcal: 450,
      currentKcal: 0,
      achieved: false,
      remainingLightMeals: 3,
    })
    expect(bonusKcal).toBe(0)
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

describe('週の欲望貯金と週の予算（月曜始まり・月またぎは日数で按分）', () => {
  it('週の途中の日付でも、その週の月曜を基準にする', () => {
    expect(calcWeeklyWantSaving(nov(8))).toBe(1050) // 日曜 → 11/2〜11/8 の週
  })

  it('月をまたぐ週は対象月の日数で按分', () => {
    // 10/26(月)〜11/1(日)：10月6日、11月1日
    expect(calcWeeklyWantSaving(nov(1), { year: 2026, month: 10 })).toBe(900)
    expect(calcWeeklyWantSaving(nov(1), { year: 2026, month: 11 })).toBe(150)
  })

  it('週の予算 = 月の残り予算 ÷ 残りの週数', () => {
    // 11/2(月)から月末まで29日 → 残り29/7週、この週は7日
    const b = calcWeeklyBudget(12180, nov(4), 2026, 11)
    expect(b.remainingDays).toBe(29)
    expect(b.daysInMonthThisWeek).toBe(7)
    expect(b.remainingWeeks).toBeCloseTo(29 / 7)
    expect(b.budgetKcal).toBe(2940) // 12180 × 7 / 29
  })

  it('月初をまたぐ週は、その月に含まれる日数分だけ', () => {
    const b = calcWeeklyBudget(12600, nov(1), 2026, 11)
    expect(b.daysInMonthThisWeek).toBe(1)
    expect(b.remainingDays).toBe(30)
    expect(b.budgetKcal).toBe(420)
  })

  it('月末をまたぐ週', () => {
    // 11/30(月)〜12/6(日)：11月は1日
    const b = calcWeeklyBudget(500, nov(30), 2026, 11)
    expect(b.daysInMonthThisWeek).toBe(1)
    expect(b.remainingDays).toBe(1)
    expect(b.budgetKcal).toBe(500)
  })

  it('対象月に含まれない週は0', () => {
    expect(calcWeeklyBudget(12600, nov(16), 2026, 10).budgetKcal).toBe(0)
  })
})

describe('軽めの回数', () => {
  it('運動ポイントの分だけ減る', () => {
    expect(calcLightMealCount(1500, 1050, 300).count).toBe(1)
  })

  it('貯金で足りていれば0回', () => {
    expect(calcLightMealCount(800, 1050)).toEqual({ shortfallKcal: 0, count: 0, exceedsWeeklyMax: false })
  })

  it('週7回を超えるとフラグ', () => {
    // 飲み会2回＋ラーメン1回 = 2500 − 1050 = 1450 → 10回
    const r = calcLightMealCount(2500, 1050)
    expect(r.count).toBe(10)
    expect(r.exceedsWeeklyMax).toBe(true)
  })
})

describe('貯金ゲージ', () => {
  const wants: WantEntry[] = [
    { id: 'beer1', kind: 'evening_drink', date: null },
    { id: 'ramen', kind: 'ramen', date: '2026-11-06' },
    { id: 'party', kind: 'drinking_party', date: '2026-11-04' },
  ]

  it('日付指定を日付順、頻度型はその後ろ', () => {
    const { gauges } = calcWantGauges(wants, 1050, 0)
    expect(gauges.map((g) => g.want.id)).toEqual(['party', 'ramen', 'beer1'])
    expect(gauges.map((g) => g.targetKcal)).toEqual([0, 450, 300])
  })

  it('軽めと運動で順に貯まる（★ラーメンまで 300/450・あと軽め1回分）', () => {
    const { gauges } = calcWantGauges(wants, 1050, 300)
    expect(gauges[1]).toMatchObject({ currentKcal: 300, targetKcal: 450, achieved: false, remainingLightMeals: 1 })
    expect(gauges[2].currentKcal).toBe(0)
  })

  it('満タンを超えた分は次の欲望、最後は翌週へ持ち越す', () => {
    const r = calcWantGauges(wants, 1050, 600)
    expect(r.gauges[1]).toMatchObject({ currentKcal: 450, achieved: true })
    expect(r.gauges[2]).toMatchObject({ currentKcal: 150, achieved: false })

    const full = calcWantGauges(wants, 1050, 900, 100)
    expect(full.gauges.every((g) => g.achieved)).toBe(true)
    expect(full.bonusKcal).toBe(250)
  })

  it('固定値以外のコストも使える', () => {
    const { gauges } = calcWantGauges([{ id: 'x', kind: 'ramen', date: null, costKcal: 1200 }], 1050, 0)
    expect(gauges[0].targetKcal).toBe(150)
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

describe('欲望の月登録 → 週展開', () => {
  const weekStart = new Date(2026, 10, 2) // 月 11/2

  it('日付指定はその週だけ、頻度は回数分（date: null）', () => {
    const entries = expandMonthlyWantsForWeek(
      [
        { id: 'a', kind: 'ramen', scheduled_date: '2026-11-06', times_per_week: null, label: null, is_active: true },
        { id: 'b', kind: 'evening_drink', scheduled_date: null, times_per_week: 3, label: '晩酌', is_active: true },
        { id: 'c', kind: 'drinking_party', scheduled_date: '2026-11-20', times_per_week: null, label: null, is_active: true },
      ],
      weekStart
    )
    expect(entries).toEqual([
      { id: 'a', kind: 'ramen', date: '2026-11-06', label: undefined },
      { id: 'b#1', kind: 'evening_drink', date: null, label: '晩酌' },
      { id: 'b#2', kind: 'evening_drink', date: null, label: '晩酌' },
      { id: 'b#3', kind: 'evening_drink', date: null, label: '晩酌' },
    ])
  })

  it('無効な行は無視', () => {
    expect(
      expandMonthlyWantsForWeek(
        [{ id: 'x', kind: 'ramen', scheduled_date: '2026-11-03', times_per_week: null, label: null, is_active: false }],
        weekStart
      )
    ).toEqual([])
  })
})

describe('目安パターンと食事差分', () => {
  it('和・洋の合計は目安 − 150', () => {
    const patterns = buildMealPatterns(2000)
    expect(patterns).toHaveLength(2)
    expect(patterns[0].totalKcal).toBe(1850)
    expect(patterns[0].slots.reduce((s, x) => s + x.kcal, 0)).toBe(1850)
    expect(patterns[1].totalKcal).toBe(1850)
  })

  it('控えめ・がっつりの差分', () => {
    expect(sumMealLogDelta([{ choice: 'light' }, { choice: 'hearty' }])).toBe(150)
    expect(countLightMealLogs([{ choice: 'light' }, { choice: 'normal' }, { choice: 'light' }])).toBe(2)
  })
})
