// app/api/admin/shifts/manual/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { calculateShift } from '@/lib/services/shift-calculator'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { staff_id, work_date, clock_in_time, clock_out_time, department, reason } = await request.json()

  if (!staff_id || !work_date || !clock_in_time || !clock_out_time) {
    return NextResponse.json({ error: 'staff_id, work_date, clock_in_time, clock_out_time required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch staff details
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('id', staff_id)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  // Build timestamps in Perth timezone
  const effectiveStart = new Date(`${work_date}T${clock_in_time}:00+08:00`)
  const effectiveEnd = new Date(`${work_date}T${clock_out_time}:00+08:00`)

  if (effectiveEnd <= effectiveStart) {
    return NextResponse.json({ error: 'Clock out must be after clock in' }, { status: 400 })
  }

  // Find roster entry if exists
  const { data: rosterEntry } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('staff_id', staff_id)
    .eq('work_date', work_date)
    .neq('status', 'rostered_off')
    .order('section', { ascending: true })
    .limit(1)
    .maybeSingle()

  const dept = department ?? rosterEntry?.department ?? staff.primary_department
  const dayOfWeek = new Date(work_date + 'T00:00:00').getDay()
  const dayType = rosterEntry?.day_type ?? (dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'normal')

  // Calculate shift pay
  const grossMins = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000)
  const breakMins = grossMins >= 270 ? Number(staff.break_minutes ?? 30) : 0

  let calc: any = null
  try {
    calc = calculateShift({
      effectiveStart,
      effectiveEnd,
      breakMinutes: breakMins,
      employmentType: staff.employment_type,
      dayType,
      baseHourlyRate: rosterEntry?.base_hourly_rate ?? staff.base_hourly_rate,
      saturdayRate: rosterEntry?.saturday_rate ?? staff.saturday_rate,
      sundayRate: rosterEntry?.sunday_rate ?? staff.sunday_rate,
      publicHolidayRate: rosterEntry?.public_holiday_rate ?? staff.public_holiday_rate,
      publicHolidayMultiplier: rosterEntry?.public_holiday_multiplier ?? staff.public_holiday_multiplier,
      overtimeThresholdHours: rosterEntry?.overtime_threshold_hours ?? staff.overtime_threshold_hours,
      overtimeMultiplier: rosterEntry?.overtime_multiplier ?? staff.overtime_multiplier,
      doubleTimeThresholdHours: rosterEntry?.double_time_threshold_hours ?? staff.double_time_threshold_hours,
      doubleTimeMultiplier: rosterEntry?.double_time_multiplier ?? staff.double_time_multiplier,
      salaryWeekly: rosterEntry?.salary_weekly ?? staff.salary_weekly,
      salaryHoursPerWeek: rosterEntry?.salary_hours_per_week ?? staff.salary_hours_per_week,
      superRatePercent: rosterEntry?.super_rate_percent ?? staff.super_rate_percent,
      trueHourlyCost: rosterEntry?.true_hourly_cost ?? staff.true_hourly_cost,
    })
  } catch (e) {
    console.error('[manual shift] calc error:', e)
  }

  // Find next available section
  const { data: existingShifts } = await supabase
    .from('shifts')
    .select('section')
    .eq('staff_id', staff_id)
    .eq('work_date', work_date)

  const usedSections = (existingShifts ?? []).map(s => s.section)
  let section = 1
  while (usedSections.includes(section)) section++

  const { data: shift, error: insertErr } = await supabase
    .from('shifts')
    .insert({
      staff_id,
      roster_entry_id: rosterEntry?.id ?? null,
      work_date,
      section,
      department: dept,
      employment_type: staff.employment_type,
      day_type: dayType,
      effective_start: effectiveStart.toISOString(),
      effective_end: effectiveEnd.toISOString(),
      gross_minutes: calc?.grossMinutes ?? grossMins,
      break_minutes: calc?.breakMinutes ?? breakMins,
      paid_minutes: calc?.paidMinutes ?? Math.max(0, grossMins - breakMins),
      paid_hours: calc?.paidHours ?? Math.round(Math.max(0, grossMins - breakMins) / 60 * 100) / 100,
      applicable_rate: calc?.applicableRate ?? staff.base_hourly_rate,
      standard_hours: calc?.standardHours ?? null,
      standard_pay: calc?.standardPay ?? null,
      overtime_hours: calc?.overtimeHours ?? null,
      overtime_rate: calc?.overtimeRate ?? null,
      overtime_pay: calc?.overtimePay ?? null,
      gross_pay: calc?.grossPay ?? null,
      super_amount: calc?.superAmount ?? null,
      leave_loading_amount: calc?.leaveLoadingAmount ?? null,
      true_shift_cost: calc?.trueShiftCost ?? null,
      true_hourly_cost: staff.true_hourly_cost,
      is_salary: calc?.isSalary ?? false,
      salary_daily_cost: calc?.salaryDailyCost ?? null,
      status: 'approved',
      manager_note: `Manual entry: ${reason ?? 'Forgot to clock in/out'}`,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, shift })
}