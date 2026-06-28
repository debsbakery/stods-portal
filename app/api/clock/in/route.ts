// app/api/clock/in/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeClockIn, computeTrustScore, haversineDistanceM } from '@/lib/services/time-snap-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { pin, token, lat, lng, device_fingerprint } = body
  if (!pin || !token) {
    return NextResponse.json({ error: 'PIN and QR token required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const nowUtc   = new Date()
  const today    = nowUtc.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

  const { data: qr } = await supabase
    .from('staff_qr_codes')
    .select('id, location_id, staff_locations(id, name, latitude, longitude, radius_metres)')
    .eq('token', token)
    .eq('active', true)
    .maybeSingle()

  if (!qr) return NextResponse.json({ error: 'Invalid QR code' }, { status: 401 })
  const location = qr.staff_locations as any

  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, employment_type, active, break_minutes, primary_department, known_device')
    .eq('pin', String(pin))
    .eq('active', true)
    .maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })

  const twentyFourHoursAgo = new Date(nowUtc.getTime() - 86400000)

  const { data: existingIn } = await supabase
    .from('clock_events')
    .select('id, raw_time, paid_time')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_in')
    .gte('raw_time', twentyFourHoursAgo.toISOString())
    .order('raw_time', { ascending: false })
    .maybeSingle()

  if (existingIn) {
    const { data: existingOut } = await supabase
      .from('clock_events')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('event_type', 'clock_out')
      .gte('raw_time', existingIn.raw_time)
      .maybeSingle()

    if (!existingOut) {
      const clockInDate = new Date(existingIn.raw_time).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
      if (clockInDate < today) {
        const autoClockOut = new Date(`${clockInDate}T17:00:00+10:00`)
        await supabase.from('clock_events').insert({
          staff_id:    staff.id,
          event_type:  'clock_out',
          raw_time:    autoClockOut.toISOString(),
          paid_time:   autoClockOut.toISOString(),
          snap_reason: 'auto_closed_forgot_to_clock_out',
          gps_valid:   false,
          trust_score: 0,
          flags:       ['auto_closed'],
        })
        await supabase.from('shifts')
          .update({
            effective_end: autoClockOut.toISOString(),
            status: 'pending',
            manager_note: 'Auto-closed: staff forgot to clock out',
          })
          .eq('staff_id', staff.id)
          .eq('work_date', clockInDate)
          .is('effective_end', null)
      } else {
        return NextResponse.json({ error: `${staff.name} is already clocked in`, already_in: true }, { status: 409 })
      }
    }
  }

  const { data: rosterEntries } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('work_date', today)
    .neq('status', 'rostered_off')
    .neq('status', 'completed')
    .order('section', { ascending: true })

  const { data: todayShifts } = await supabase
    .from('shifts')
    .select('section')
    .eq('staff_id', staff.id)
    .eq('work_date', today)

  const usedSections = (todayShifts ?? []).map((s: any) => s.section)
  const rosterEntry = rosterEntries?.find(e => !usedSections.includes(e.section)) ?? null

  const scheduledStart = rosterEntry?.scheduled_start
    ? new Date(`${today}T${rosterEntry.scheduled_start.slice(0, 5)}:00+10:00`)
    : null

  const { paidTime, snapReason } = computeClockIn({
    rawTime: nowUtc,
    scheduledStart,
    employmentType: staff.employment_type,
  })

  let distanceM: number | null = null
  let gpsValid = false

  if (lat && lng && location?.latitude && location?.longitude) {
    distanceM = Math.round(haversineDistanceM(
      Number(lat), Number(lng),
      Number(location.latitude), Number(location.longitude)
    ))
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

  const { data: insertedEvent, error: evtErr } = await supabase
    .from('clock_events')
    .insert({
      staff_id:           staff.id,
      roster_entry_id:    rosterEntry?.id ?? null,
      event_type:         'clock_in',
      raw_time:           nowUtc.toISOString(),
      paid_time:          paidTime.toISOString(),
      snap_reason:        snapReason,
      gps_lat:            lat ?? null,
      gps_lng:            lng ?? null,
      gps_valid:          gpsValid,
      ip_address:         ipAddress,
      trust_score:        trustScore,
      flags:              flags.length > 0 ? flags : null,
      device_fingerprint: device_fingerprint ?? null,
    })
    .select()
    .single()

  if (evtErr) {
    console.error('[clock-in] INSERT ERROR:', evtErr.message, evtErr.code, evtErr.details)
    return NextResponse.json({ error: evtErr.message, code: evtErr.code }, { status: 500 })
  }

  if (rosterEntry) {
    await supabase.from('roster_entries').update({ status: 'present' }).eq('id', rosterEntry.id)
  }

  // FIX: include +10:00 offset so getDay() is correct for Brisbane, not UTC
  const dayOfWeek = new Date(today + 'T00:00:00+10:00').getDay()
  const dayType = rosterEntry?.day_type
    ?? (dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'normal')

  let section = rosterEntry?.section ?? 1
  if (!rosterEntry) {
    for (let s = 1; s <= 3; s++) {
      if (!usedSections.includes(s)) { section = s; break }
    }
  }

  const dept = rosterEntry?.department ?? staff.primary_department ?? 'production'

  const { error: shiftErr } = await supabase
    .from('shifts')
    .upsert({
      staff_id:        staff.id,
      roster_entry_id: rosterEntry?.id ?? null,
      work_date:       today,
      section:         section,
      department:      dept,
      employment_type: staff.employment_type,
      day_type:        dayType,
      clock_in_id:     insertedEvent.id,
      effective_start: paidTime.toISOString(),
      gross_minutes:   0,
      break_minutes:   0,
      paid_minutes:    0,
      paid_hours:      0,
      status:          'pending',
    }, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: false })

  if (shiftErr) {
    console.error('[clock-in] shift create error:', shiftErr.message)
  }

  const rawTimeStr = nowUtc.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const paidTimeStr = paidTime.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return NextResponse.json({
    success:        true,
    staff_name:     staff.name,
    raw_time:       rawTimeStr,
    clocked_in:     paidTimeStr,
    is_early_late:  rawTimeStr !== paidTimeStr,
    snap_reason:    snapReason,
    trust_score:    trustScore,
    flags,
    gps_distance:   distanceM,
    message:        `Clock in at ${rawTimeStr}`,
    debug_inserted: !!insertedEvent,
  })
}