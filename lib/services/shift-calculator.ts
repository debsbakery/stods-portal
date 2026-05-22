// lib/services/shift-calculator.ts

export interface ShiftCalcResult {
  grossMinutes:     number
  breakMinutes:     number
  paidMinutes:      number
  paidHours:        number
  applicableRate:   number
  standardHours:    number
  standardPay:      number
  overtimeHours:    number
  overtimeRate:     number
  overtimePay:      number
  doubleTimeHours:  number
  doubleTimeRate:   number
  doubleTimePay:    number
  grossPay:         number | null   // null for salary
  superAmount:      number
  leaveLoadingAmount: number
  trueShiftCost:    number
  isSalary:         boolean
  salaryDailyCost:  number | null
}

export function calculateShift(params: {
  effectiveStart:           Date
  effectiveEnd:             Date
  breakMinutes:             number
  employmentType:           string
  dayType:                  string
  baseHourlyRate:           number | null
  saturdayRate:             number | null
  sundayRate:               number | null
  publicHolidayRate:        number | null
  publicHolidayMultiplier:  number | null
  overtimeThresholdHours:   number | null
  overtimeMultiplier:       number | null
  doubleTimeThresholdHours: number | null
  doubleTimeMultiplier:     number | null
  salaryWeekly:             number | null
  salaryHoursPerWeek:       number | null
  superRatePercent:         number | null
  trueHourlyCost:           number | null
}): ShiftCalcResult {
  const {
    effectiveStart, effectiveEnd, breakMinutes, employmentType, dayType,
    baseHourlyRate, saturdayRate, sundayRate, publicHolidayRate,
    publicHolidayMultiplier, overtimeThresholdHours, overtimeMultiplier,
    doubleTimeThresholdHours, doubleTimeMultiplier,
    salaryWeekly, salaryHoursPerWeek, superRatePercent, trueHourlyCost,
  } = params

  const grossMinutes = Math.round(
    (effectiveEnd.getTime() - effectiveStart.getTime()) / 60000
  )
  const paidMinutes  = Math.max(0, grossMinutes - breakMinutes)
  const paidHours    = Math.round((paidMinutes / 60) * 100) / 100

  // ── Salary staff — no pay calc ────────────────────────────────────────────
  if (employmentType === 'salary') {
    const weeklyPay   = Number(salaryWeekly ?? 0)
    const weeklyHours = Number(salaryHoursPerWeek ?? 38)
    const dailyCost   = Math.round((weeklyPay / 5) * 100) / 100
    return {
      grossMinutes, breakMinutes, paidMinutes, paidHours,
      applicableRate: 0, standardHours: paidHours,
      standardPay: 0, overtimeHours: 0, overtimeRate: 0, overtimePay: 0,
      doubleTimeHours: 0, doubleTimeRate: 0, doubleTimePay: 0,
      grossPay: null, superAmount: 0, leaveLoadingAmount: 0,
      trueShiftCost: dailyCost, isSalary: true, salaryDailyCost: dailyCost,
    }
  }

  // ── Pick applicable rate based on day type ────────────────────────────────
  let applicableRate = Number(baseHourlyRate ?? 0)
  if (dayType === 'saturday'       && saturdayRate)        applicableRate = Number(saturdayRate)
  else if (dayType === 'sunday'    && sundayRate)           applicableRate = Number(sundayRate)
  else if (dayType === 'public_holiday') {
    if (publicHolidayRate)          applicableRate = Number(publicHolidayRate)
    else if (publicHolidayMultiplier) applicableRate = Number(baseHourlyRate ?? 0) * Number(publicHolidayMultiplier)
  }

  // ── Overtime + double time split ──────────────────────────────────────────
  let standardHours   = paidHours
  let overtimeHours   = 0
  let doubleTimeHours = 0

  if (doubleTimeThresholdHours && paidHours > doubleTimeThresholdHours) {
    const otThreshold = Number(overtimeThresholdHours ?? doubleTimeThresholdHours)
    standardHours    = otThreshold
    overtimeHours    = Math.round((Number(doubleTimeThresholdHours) - otThreshold) * 100) / 100
    doubleTimeHours  = Math.round((paidHours - Number(doubleTimeThresholdHours)) * 100) / 100
  } else if (overtimeThresholdHours && paidHours > overtimeThresholdHours) {
    standardHours  = Number(overtimeThresholdHours)
    overtimeHours  = Math.round((paidHours - Number(overtimeThresholdHours)) * 100) / 100
  }

  const otMult   = Number(overtimeMultiplier   ?? 1.5)
  const dtMult   = Number(doubleTimeMultiplier ?? 2.0)
  const otRate   = Math.round(applicableRate * otMult * 100) / 100
  const dtRate   = Math.round(applicableRate * dtMult * 100) / 100

  const standardPay    = Math.round(standardHours   * applicableRate * 100) / 100
  const overtimePay    = Math.round(overtimeHours   * otRate         * 100) / 100
  const doubleTimePay  = Math.round(doubleTimeHours * dtRate         * 100) / 100
  const grossPay       = Math.round((standardPay + overtimePay + doubleTimePay) * 100) / 100

  // ── On-costs ──────────────────────────────────────────────────────────────
  const superPct           = Number(superRatePercent ?? 11.5) / 100
  const superAmount        = Math.round(grossPay * superPct * 100) / 100
  const leaveLoadingAmount = Math.round(
    grossPay * (152 / 52 / 38) * (17.5 / 100) * 100
  ) / 100
  const trueShiftCost      = Math.round((grossPay + superAmount + leaveLoadingAmount) * 100) / 100

  return {
    grossMinutes, breakMinutes, paidMinutes, paidHours,
    applicableRate, standardHours, standardPay,
    overtimeHours, overtimeRate: otRate, overtimePay,
    doubleTimeHours, doubleTimeRate: dtRate, doubleTimePay,
    grossPay, superAmount, leaveLoadingAmount, trueShiftCost,
    isSalary: false, salaryDailyCost: null,
  }
}