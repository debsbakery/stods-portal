// app/api/clock/out/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeClockOut, computeTrustScore, haversineDistanceM } from '@/lib/services/time-snap-service'
import { calculateShift } from '@/lib/services/shift-calculator'

export async function POST(request: NextRequest) {
  const body = await request.json()
const { pin, token, lat, lng, device_fingerprint } = body
  if (!pin || !token) {
    return NextResponse.json({ error: 'PIN and QR token required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const nowUtc   = new Date()
  const today    = nowUtc.toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' })
  const nowLocal = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Australia/Perth' }))

  const { data: qr } = await supabase
    .from('staff_qr_codes')
.select('id, name, employment_type, active, break_minutes, primary_department, known_device')
    .eq('token', token)
    .eq('active', true)
    .maybeSingle()

  if (!qr) return NextResponse.json({ error: 'Invalid QR code' }, { status: 401 })
  const location = qr.staff_locations as any

  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, employment_type, active, break_minutes, primary_department')
    .eq('pin', String(pin))
    .eq('active', true)
    .maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })

  const twentyFourHoursAgo = new Date(nowUtc.getTime() - 86400000)

  const { data: clockInEvent } = await supabase
    .from('clock_events')
    .select('id, paid_time, roster_entry_id')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_in')
    .gte('raw_time', twentyFourHoursAgo.toISOString())
    .order('raw_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!clockInEvent) {
    // Debug: check what events exist at all
    const { data: allEvents } = await supabase
      .from('clock_events')
      .select('event_type, raw_time')
      .eq('staff_id', staff.id)
      .order('raw_time', { ascending: false })
      .limit(3)
    return NextResponse.json({
      error: `${staff.name} has not clocked in`,
      not_in: true,
      debug_cutoff: twentyFourHoursAgo.toISOString(),
      debug_recent_events: allEvents ?? [],
    }, { status: 409 })
  }

  const { data: existingOut } = await supabase
    .from('clock_events')
    .select('id')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_out')
    .gte('raw_time', clockInEvent.paid_time)
    .maybeSingle()

  if (existingOut) {
    return NextResponse.json({ error: `${staff.name} has already clocked out`, already_out: true }, { status: 409 })
  }

  let rosterEntry: any = null

  if (clockInEvent.roster_entry_id) {
    const { data } = await supabase.from('roster_entries').select('*').eq('id', clockInEvent.roster_entry_id).maybeSingle()
    rosterEntry = data
  }

  if (!rosterEntry) {
    const { data: entries } = await supabase
      .from('roster_entries')
      .select('*')
      .eq('staff_id', staff.id)
      .eq('work_date', today)
      .in('status', ['present', 'scheduled'])
      .order('section', { ascending: true })

    // Pick the one that's 'present' (currently being worked) or first available
    rosterEntry = entries?.find(e => e.status === 'present') ?? entries?.[0] ?? null
  }

  const scheduledEnd = rosterEntry?.scheduled_end
    ? new Date(`${today}T${rosterEntry.scheduled_end}:00+08:00`)
    : null

  const paidStart = new Date(clockInEvent.paid_time)

  const { paidTime, snapReason } = computeClockOut({
    rawTime:        nowUtc,
    scheduledEnd,
    employmentType: staff.employment_type,
    paidStart,
  })

  let distanceM: number | null = null
  let gpsValid = false

  if (lat && lng && location?.latitude) {
    distanceM = Math.round(haversineDistanceM(Number(lat), Number(lng), Number(location.latitude), Number(location.longitude)))
    gpsValid = distanceM <= Number(location.radius_metres ?? 200)
  }
const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ?? null

let deviceFlag: string | null = null
const knownDevice = (staff as any).known_device

if (device_fingerprint) {
  if (!knownDevice) {
    await supabase
      .from('staff')
      .update({ 
        known_device: device_fingerprint,
        known_device_set_at: nowUtc.toISOString()
      })
      .eq('id', staff.id)
  } else if (knownDevice !== device_fingerprint) {
    deviceFlag = 'different_device'
  }
}

const { score: trustScore, flags: gpsFlags } = computeTrustScore({
  gpsValid, distanceM,
  radiusM: Number(location?.radius_metres ?? 200),
  ipMatchesSite: true,
})

const flags = deviceFlag ? [...gpsFlags, deviceFlag] : gpsFlags

  const { data: outEvent, error: evtErr } = await supabase
    .from('clock_events')
    .insert({
      staff_id:        staff.id,
      roster_entry_id: clockInEvent.roster_entry_id ?? rosterEntry?.id ?? null,
      event_type:      'clock_out',
      raw_time:        nowUtc.toISOString(),
      paid_time:       paidTime.toISOString(),
      snap_reason:     snapReason,
      gps_lat:         lat ?? null,
      gps_lng:         lng ?? null,
      gps_valid:       gpsValid,
      ip_address:      ipAddress,
      trust_score:     trustScore,
      flags:           flags.length > 0 ? flags : null,
   device_fingerprint: device_fingerprint ?? null,
    })
    .select()
    .single()

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 500 })

  let calc: ReturnType<typeof calculateShift> | null = null

  if (rosterEntry) {
    calc = calculateShift({
      effectiveStart:           paidStart,
      effectiveEnd:             paidTime,
      breakMinutes:             Number(rosterEntry.break_minutes ?? staff.break_minutes ?? 30),
      employmentType:           staff.employment_type,
      dayType:                  rosterEntry.day_type ?? 'normal',
      baseHourlyRate:           rosterEntry.base_hourly_rate,
      saturdayRate:             rosterEntry.saturday_rate,
      sundayRate:               rosterEntry.sunday_rate,
      publicHolidayRate:        rosterEntry.public_holiday_rate,
      publicHolidayMultiplier:  rosterEntry.public_holiday_multiplier,
      overtimeThresholdHours:   rosterEntry.overtime_threshold_hours,
      overtimeMultiplier:       rosterEntry.overtime_multiplier,
      doubleTimeThresholdHours: rosterEntry.double_time_threshold_hours,
      doubleTimeMultiplier:     rosterEntry.double_time_multiplier,
      salaryWeekly:             rosterEntry.salary_weekly,
      salaryHoursPerWeek:       rosterEntry.salary_hours_per_week,
      superRatePercent:         rosterEntry.super_rate_percent,
      trueHourlyCost:           rosterEntry.true_hourly_cost,
    })
  }

  if (calc && rosterEntry) {
    const { error: shiftErr } = await supabase.from('shifts').upsert({
      staff_id:             staff.id,
      roster_entry_id:      rosterEntry.id,
      work_date:            today,
      section:              rosterEntry.section ?? 1,
      department:           rosterEntry.department ?? staff.primary_department,
      employment_type:      staff.employment_type,
      day_type:             rosterEntry.day_type ?? 'normal',
      clock_in_id:          clockInEvent.id,
      clock_out_id:         outEvent.id,
      effective_start:      paidStart.toISOString(),
      effective_end:        paidTime.toISOString(),
      gross_minutes:        calc.grossMinutes,
      break_minutes:        calc.breakMinutes,
      paid_minutes:         calc.paidMinutes,
      paid_hours:           calc.paidHours,
      applicable_rate:      calc.applicableRate,
      standard_hours:       calc.standardHours,
      standard_pay:         calc.standardPay,
      overtime_hours:       calc.overtimeHours,
      overtime_rate:        calc.overtimeRate,
      overtime_pay:         calc.overtimePay,
      double_time_hours:    calc.doubleTimeHours,
      double_time_rate:     calc.doubleTimeRate,
      double_time_pay:      calc.doubleTimePay,
      gross_pay:            calc.grossPay,
      super_amount:         calc.superAmount,
      leave_loading_amount: calc.leaveLoadingAmount,
      true_shift_cost:      calc.trueShiftCost,
      true_hourly_cost:     rosterEntry.true_hourly_cost,
      is_salary:            calc.isSalary,
      salary_daily_cost:    calc.salaryDailyCost,
      status:               'pending',
    }, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: false })

    if (shiftErr) console.error('[clock-out] shift error:', shiftErr.message)

    await supabase.from('roster_entries').update({ status: 'completed' }).eq('id', rosterEntry.id)

  } else {
    const grossMins  = Math.round((paidTime.getTime() - paidStart.getTime()) / 60000)
    const breakMins  = Number(staff.break_minutes ?? 30)
    const paidMins   = Math.max(0, grossMins - breakMins)

    const { error: fallbackErr } = await supabase.from('shifts').upsert({
      staff_id:        staff.id,
      work_date:       today,
      section:         1,
      department:      staff.primary_department ?? 'production',
      employment_type: staff.employment_type,
      day_type:        'normal',
      clock_in_id:     clockInEvent.id,
      clock_out_id:    outEvent.id,
      effective_start: paidStart.toISOString(),
      effective_end:   paidTime.toISOString(),
      gross_minutes:   grossMins,
      break_minutes:   breakMins,
      paid_minutes:    paidMins,
      paid_hours:      Math.round((paidMins / 60) * 100) / 100,
      status:          'pending',
    }, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: false })

    if (fallbackErr) console.error('[clock-out] fallback error:', fallbackErr.message)
  }

  const paidHours = calc?.paidHours ?? Math.round(
    Math.max(0, (paidTime.getTime() - paidStart.getTime()) / 60000 - Number(staff.break_minutes ?? 30)) / 60 * 100
  ) / 100

  const rawOutStr = nowLocal.toTimeString().slice(0, 5)
  const rawInStr  = new Date(new Date(clockInEvent.paid_time).toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toTimeString().slice(0, 5)

  return NextResponse.json({
    success:     true,
    staff_name:  staff.name,
    raw_time:    rawOutStr,
    clocked_in:  rawInStr,
    clocked_out: paidTime.toTimeString().slice(0, 5),
    paid_hours:  paidHours,
    gross_pay:   calc?.grossPay ?? null,
    snap_reason: snapReason,
    trust_score: trustScore,
    flags,
    message:     `Clock out at ${rawOutStr} - ${paidHours.toFixed(2)} hrs`,
  })
}