// lib/services/time-snap-service.ts

export const SNAP_INTERVAL_MIN = 15
export const CLOCK_IN_GRACE_MIN = 4   // clock in ≤4 min after a 15-min mark → paid from that mark
export const CLOCK_OUT_GRACE_MIN = 2  // clock out ≤2 min before a 15-min mark → paid to that mark

// ⚠️ Per-portal: Debs/Stods = Australia/Brisbane, Norbake/Kimbercrust = Australia/Perth
const PORTAL_TZ = 'Australia/Brisbane'

export function snapMinutes(mins: number, direction: 'up' | 'down'): number {
  if (direction === 'up')   return Math.ceil(mins  / SNAP_INTERVAL_MIN) * SNAP_INTERVAL_MIN
  if (direction === 'down') return Math.floor(mins / SNAP_INTERVAL_MIN) * SNAP_INTERVAL_MIN
  return mins
}

// NOTE: operates on UTC fields. Safe for 15-min snapping because Brisbane (+10)
// and Perth (+8) are whole-hour offsets — 15-min boundaries align with UTC's.
export function snapTime(date: Date, direction: 'up' | 'down'): Date {
  const result  = new Date(date)
  const mins    = result.getUTCMinutes()
  const snapped = snapMinutes(mins, direction)
  result.setUTCSeconds(0, 0)
  if (snapped >= 60) {
    result.setUTCHours(result.getUTCHours() + 1)
    result.setUTCMinutes(0)
  } else {
    result.setUTCMinutes(snapped)
  }
  return result
}

// ── Clock-in snap: 15-min increments with grace ──────────────────────────
// ≤4 min past a 15-min mark → paid from that mark (grace)
// otherwise → paid from the NEXT mark (never paid for time before arrival)
export function snapClockInTime(rawTime: Date): Date {
  const minsPastMark = rawTime.getUTCMinutes() % SNAP_INTERVAL_MIN
  return minsPastMark <= CLOCK_IN_GRACE_MIN
    ? snapTime(rawTime, 'down')
    : snapTime(rawTime, 'up')
}

// ── Clock-out snap: 15-min increments with grace ─────────────────────────
// ≤2 min before the next 15-min mark → paid to that mark
// otherwise → paid to the PREVIOUS mark (never paid past departure)
export function snapClockOutTime(rawTime: Date): Date {
  const minsToNextMark = (SNAP_INTERVAL_MIN - (rawTime.getUTCMinutes() % SNAP_INTERVAL_MIN)) % SNAP_INTERVAL_MIN
  return (minsToNextMark > 0 && minsToNextMark <= CLOCK_OUT_GRACE_MIN)
    ? snapTime(rawTime, 'up')
    : snapTime(rawTime, 'down')
}

export function computeClockIn(params: {
  rawTime:        Date
  scheduledStart: Date | null
  employmentType: string
}): { paidTime: Date; snapReason: string } {
  const { rawTime, scheduledStart, employmentType } = params

  // Salary: presence only
  if (employmentType === 'salary') {
    return { paidTime: rawTime, snapReason: 'salary_presence_only' }
  }

  // No roster — 15-min increments with clock-on grace, snap UP beyond grace
  if (!scheduledStart) {
    const paidTime = snapClockInTime(rawTime)
    return {
      paidTime,
      snapReason: `no_roster_paid_from_${fmtT(paidTime)}`,
    }
  }

  const diffMin = (rawTime.getTime() - scheduledStart.getTime()) / 60000

  // Early or on time — paid from scheduled start
  if (diffMin <= 0) {
    return {
      paidTime:   scheduledStart,
      snapReason: `early_${Math.abs(Math.round(diffMin))}min_paid_from_scheduled_${fmtT(scheduledStart)}`,
    }
  }

  // Late but within clock-on grace of scheduled start — paid from scheduled start
  if (diffMin <= CLOCK_IN_GRACE_MIN) {
    return {
      paidTime:   scheduledStart,
      snapReason: `late_${Math.round(diffMin)}min_within_grace_paid_from_${fmtT(scheduledStart)}`,
    }
  }

  // Late beyond grace — 15-min increments with grace against the marks
  const paidTime = snapClockInTime(rawTime)
  return {
    paidTime,
    snapReason: `late_${Math.round(diffMin)}min_paid_from_${fmtT(paidTime)}`,
  }
}

export function computeClockOut(params: {
  rawTime:        Date
  scheduledEnd:   Date | null
  employmentType: string
  paidStart:      Date
}): { paidTime: Date; snapReason: string } {
  const { rawTime, scheduledEnd, employmentType, paidStart } = params

  // Salary: presence only
  if (employmentType === 'salary') {
    return { paidTime: rawTime, snapReason: 'salary_presence_only' }
  }

    // Set-hours staff ('set_hours', legacy 'fixed'): schedule bounds pay both ends.
  // Scheduled end is a CAP, never a floor. Leave early → normal snap below.
  if ((employmentType === 'set_hours' || employmentType === 'fixed') && scheduledEnd) {
    const graceMs = CLOCK_OUT_GRACE_MIN * 60000
    if (rawTime.getTime() >= scheduledEnd.getTime() - graceMs) {
      return {
        paidTime:   scheduledEnd,
        snapReason: `set_hours_capped_at_scheduled_end_${fmtT(scheduledEnd)}`,
      }
    }
    // Early departure — fall through to normal snap
  }

  const paidTime = snapClockOutTime(rawTime)

  // Safety: never end before paid start
  if (paidTime.getTime() <= paidStart.getTime()) {
    const rawDiffMin = (rawTime.getTime() - paidStart.getTime()) / 60000
    if (rawDiffMin < 0) {
      return { paidTime: paidStart, snapReason: 'clock_out_before_shift_start_zero_hours' }
    }
    return { paidTime: paidStart, snapReason: `clock_out_under_15min_paid_from_${fmtT(paidStart)}` }
  }

  return { paidTime, snapReason: `paid_to_${fmtT(paidTime)}` }
}

// Format in PORTAL timezone (was UTC — caused labels like "snapped_down_to_23:00")
function fmtT(d: Date): string {
  return d.toLocaleTimeString('en-AU', {
    timeZone: PORTAL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function haversineDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function computeTrustScore(params: {
  gpsValid:      boolean
  distanceM:     number | null
  radiusM:       number
  ipMatchesSite: boolean
}): { score: number; flags: string[] } {
  let score = 100
  const flags: string[] = []
  const { distanceM, radiusM, ipMatchesSite } = params

  if (distanceM === null) {
    // GPS genuinely missing
    score -= 40
    flags.push('no_gps')
  } else if (distanceM > radiusM) {
    // GPS present but outside the zone (was mislabelled no_gps before)
    score -= 50
    flags.push(`outside_zone_${Math.round(distanceM)}m_from_site`)
  }

  if (!ipMatchesSite) {
    score -= 15
    flags.push('off_site_ip')
  }

  return { score: Math.max(0, score), flags }
}