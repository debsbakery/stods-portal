// app/api/clock/in/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeClockIn, computeTrustScore, haversineDistanceM } from '@/lib/services/time-snap-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { pin, token, lat, lng } = body

  if (!pin || !token) {
    return NextResponse.json({ error: 'PIN and QR token required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const nowUtc   = new Date()
  const today    = nowUtc.toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' })
  const nowLocal = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Australia/Perth' }))

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
    .select('id, name, employment_type, active')
    .eq('pin', String(pin))
    .eq('active', true)
    .maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })

  const twentyFourHoursAgo = new Date(nowUtc.getTime() - 86400000)

  const { data: existingIn } = await supabase
    .from('clock_events')
    .select('id, paid_time')
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
      .gte('raw_time', existingIn.paid_time)
      .maybeSingle()

    if (!existingOut) {
      return NextResponse.json({ error: `${staff.name} is already clocked in`, already_in: true }, { status: 409 })
    }
  }

   // Find the next unstarted roster entry (supports split shifts)
  const { data: rosterEntries } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('work_date', today)
    .neq('status', 'rostered_off')
    .neq('status', 'completed')
    .order('section', { ascending: true })

  const rosterEntry = rosterEntries?.[0] ?? null
  const scheduledStart = rosterEntry?.scheduled_start
    ? new Date(`${today}T${rosterEntry.scheduled_start}:00+08:00`)
    : null

  const { paidTime, snapReason } = computeClockIn({
    rawTime: nowUtc,
    scheduledStart,
    employmentType: staff.employment_type,
  })

  let distanceM: number | null = null
  let gpsValid = false

  if (lat && lng && location?.latitude && location?.longitude) {
    distanceM = Math.round(haversineDistanceM(Number(lat), Number(lng), Number(location.latitude), Number(location.longitude)))
    gpsValid = distanceM <= Number(location.radius_metres ?? 200)
  }

  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ?? null
  const { score: trustScore, flags } = computeTrustScore({
    gpsValid, distanceM,
    radiusM: Number(location?.radius_metres ?? 200),
    ipMatchesSite: true,
  })

  const { data: insertedEvent, error: evtErr } = await supabase
    .from('clock_events')
    .insert({
      staff_id:        staff.id,
      roster_entry_id: rosterEntry?.id ?? null,
      event_type:      'clock_in',
      raw_time:        nowUtc.toISOString(),
      paid_time:       paidTime.toISOString(),
      snap_reason:     snapReason,
      gps_lat:         lat ?? null,
      gps_lng:         lng ?? null,
      gps_valid:       gpsValid,
      ip_address:      ipAddress,
      trust_score:     trustScore,
      flags:           flags.length > 0 ? flags : null,
    })

  if (evtErr) {
    console.error('[clock-in] INSERT ERROR:', evtErr.message, evtErr.code, evtErr.details)
    return NextResponse.json({ error: evtErr.message, code: evtErr.code }, { status: 500 })
  }

  if (rosterEntry) {
    await supabase.from('roster_entries').update({ status: 'present' }).eq('id', rosterEntry.id)
  }

  const rawTimeStr  = nowLocal.toTimeString().slice(0, 5)
  const paidTimeStr = new Date(paidTime.toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toTimeString().slice(0, 5)

  return NextResponse.json({
    success:       true,
    staff_name:    staff.name,
    raw_time:      rawTimeStr,
    clocked_in:    paidTimeStr,
    is_early_late: rawTimeStr !== paidTimeStr,
    snap_reason:   snapReason,
    trust_score:   trustScore,
    flags,
    gps_distance:  distanceM,
    message:       `Clock in at ${rawTimeStr}`,
    debug_inserted: !!insertedEvent,
  })
}