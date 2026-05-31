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
.select('id, name, employment_type, active, break_minutes, primary_department, known_device')    .eq('pin', String(pin))
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

// Find roster entry that hasn't been clocked into yet
const { data: todayShifts } = await supabase
  .from('shifts')
  .select('section')
  .eq('staff_id', staff.id)
  .eq('work_date', today)

const usedSections = (todayShifts ?? []).map((s: any) => s.section)
const rosterEntry = rosterEntries?.find(e => !usedSections.includes(e.section)) ?? null  const scheduledStart = rosterEntry?.scheduled_start
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

  // Insert clock event
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

  // ── Create shift row immediately (open shift — no end time) ──
  const dayOfWeek = new Date(today + 'T00:00:00').getDay()
  const dayType = rosterEntry?.day_type
    ?? (dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'normal')
// Auto-assign next available section if no roster entry
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
    // Don't fail the whole clock-in — the event is already recorded
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