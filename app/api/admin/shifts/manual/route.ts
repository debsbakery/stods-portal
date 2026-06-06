export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { calculateShift } from '@/lib/services/shift-calculator'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { staff_id, work_date, clock_in_time, clock_out_time, department, reason, force_out, shift_id } = body

  // ── Force clock-out on existing open shift ──
  if (force_out && shift_id && clock_out_time) {
    const supabase = createAdminClient()

    const { data: openShift } = await supabase
      .from('shifts')
      .select('*, staff:staff_id(employment_type, break_minutes, primary_department, base_hourly_rate, saturday_rate, sunday_rate, true_hourly_cost)')
      .eq('id', shift_id)
      .maybeSingle()

    if (!openShift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

    const effectiveStart = new Date(openShift.effective_start)
    const effectiveEnd   = new Date(`${openShift.work_date}T${clock_out_time}:00+08:00`)

    if (effectiveEnd <= effectiveStart) {
      return NextResponse.json({ error: 'Clock out must be after clock in' }, { status: 400 })
    }

    const grossMins = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000)
    const breakMins = grossMins >= 270 ? Number(openShift.staff?.break_minutes ?? 30) : 0
    const paidMins  = Math.max(0, grossMins - breakMins)
    const paidHours = Math.round(paidMins / 60 * 100) / 100

    // ✅ Insert clock_out event FIRST so we can link its id to the shift
    const { data: clockOutEvent } = await supabase
      .from('clock_events')
      .insert({
        staff_id:        openShift.staff_id,
        roster_entry_id: openShift.roster_entry_id ?? null,
        event_type:      'clock_out',
        raw_time:        effectiveEnd.toISOString(),
        paid_time:       effectiveEnd.toISOString(),
        snap_reason:     `admin_force_out: ${reason ?? ''}`.trim(),
        gps_valid:       false,
        trust_score:     100,
        flags:           ['admin_override'],
      })
      .select()
      .single()

    // ✅ Update shift with clock_out_id linked
    const { error: updateErr } = await supabase
      .from('shifts')
      .update({
        effective_end:  effectiveEnd.toISOString(),
        gross_minutes:  grossMins,
        break_minutes:  breakMins,
        paid_minutes:   paidMins,
        paid_hours:     paidHours,
        clock_out_id:   clockOutEvent?.id ?? null,
        status:         'pending',
        manager_note:   `Admin force clock-out at ${clock_out_time}: ${reason ?? ''}`.trim(),
      })
      .eq('id', shift_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // ✅ Mark roster entry completed so staff can't clock in again for this section
    if (openShift.roster_entry_id) {
      await supabase
        .from('roster_entries')
        .update({ status: 'completed' })
        .eq('id', openShift.roster_entry_id)
    }

    return NextResponse.json({ success: true, paid_hours: paidHours })
  }

  // clock_out_time is now OPTIONAL
  if (!staff_id || !work_date || !clock_in_time) {
    return NextResponse.json({ error: 'staff_id, work_date, clock_in_time required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('id', staff_id)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const effectiveStart = new Date(`${work_date}T${clock_in_time}:00+08:00`)
  const effectiveEnd = clock_out_time
    ? new Date(`${work_date}T${clock_out_time}:00+08:00`)
    : null

  if (effectiveEnd && effectiveEnd <= effectiveStart) {
    return NextResponse.json({ error: 'Clock out must be after clock in' }, { status: 400 })
  }

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

  // Clock-in only — create open shift
  if (!effectiveEnd) {
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
        department:      dept,
        employment_type: staff.employment_type,
        day_type:        dayType,
        effective_start: effectiveStart.toISOString(),
        effective_end:   null,
        gross_minutes:   0,
        break_minutes:   0,
        paid_minutes:    0,
        paid_hours:      0,
        status:          'clocked_in',
        manager_note:    `Manual clock-in: ${reason ?? 'QR scan failed'}`,
      })
      .select()
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    return NextResponse.json({ success: true, shift, clock_in_only: true })
  }

  // Full shift — clock in + clock out
  const grossMins = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000)
  const breakMins = grossMins >= 270 ? Number(staff.break_minutes ?? 30) : 0

  let calc: any = null
  try {
    calc = calculateShift({
      effectiveStart,
      effectiveEnd,
      breakMinutes:             breakMins,
      employmentType:           staff.employment_type,
      dayType,
      baseHourlyRate:           rosterEntry?.base_hourly_rate           ?? staff.base_hourly_rate,
      saturdayRate:             rosterEntry?.saturday_rate              ?? staff.saturday_rate,
      sundayRate:               rosterEntry?.sunday_rate                ?? staff.sunday_rate,
      publicHolidayRate:        rosterEntry?.public_holiday_rate        ?? staff.public_holiday_rate,
      publicHolidayMultiplier:  rosterEntry?.public_holiday_multiplier  ?? staff.public_holiday_multiplier,
      overtimeThresholdHours:   rosterEntry?.overtime_threshold_hours   ?? staff.overtime_threshold_hours,
      overtimeMultiplier:       rosterEntry?.overtime_multiplier        ?? staff.overtime_multiplier,
      doubleTimeThresholdHours: rosterEntry?.double_time_threshold_hours ?? staff.double_time_threshold_hours,
      doubleTimeMultiplier:     rosterEntry?.double_time_multiplier     ?? staff.double_time_multiplier,
      salaryWeekly:             rosterEntry?.salary_weekly              ?? staff.salary_weekly,
      salaryHoursPerWeek:       rosterEntry?.salary_hours_per_week      ?? staff.salary_hours_per_week,
      superRatePercent:         rosterEntry?.super_rate_percent         ?? staff.super_rate_percent,
      trueHourlyCost:           rosterEntry?.true_hourly_cost           ?? staff.true_hourly_cost,
    })
  } catch (e) {
    console.error('[manual shift] calc error:', e)
  }

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
      roster_entry_id:      rosterEntry?.id ?? null,
      work_date,
      section,
      department:           dept,
      employment_type:      staff.employment_type,
      day_type:             dayType,
      effective_start:      effectiveStart.toISOString(),
      effective_end:        effectiveEnd.toISOString(),
      gross_minutes:        calc?.grossMinutes        ?? grossMins,
      break_minutes:        calc?.breakMinutes        ?? breakMins,
      paid_minutes:         calc?.paidMinutes         ?? Math.max(0, grossMins - breakMins),
      paid_hours:           calc?.paidHours           ?? Math.round(Math.max(0, grossMins - breakMins) / 60 * 100) / 100,
      applicable_rate:      calc?.applicableRate      ?? staff.base_hourly_rate,
      standard_hours:       calc?.standardHours       ?? null,
      standard_pay:         calc?.standardPay         ?? null,
      overtime_hours:       calc?.overtimeHours       ?? null,
      overtime_rate:        calc?.overtimeRate        ?? null,
      overtime_pay:         calc?.overtimePay         ?? null,
      gross_pay:            calc?.grossPay            ?? null,
      super_amount:         calc?.superAmount         ?? null,
      leave_loading_amount: calc?.leaveLoadingAmount  ?? null,
      true_shift_cost:      calc?.trueShiftCost       ?? null,
      true_hourly_cost:     staff.true_hourly_cost,
      is_salary:            calc?.isSalary            ?? false,
      salary_daily_cost:    calc?.salaryDailyCost     ?? null,
      status:               'approved',
      manager_note:         `Manual entry: ${reason ?? 'Forgot to clock in/out'}`,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ success: true, shift })
}