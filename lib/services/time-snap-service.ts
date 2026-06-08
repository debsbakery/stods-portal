// lib/services/time-snap-service.ts

export const SNAP_INTERVAL_MIN = 15

export function snapMinutes(mins: number, direction: 'up' | 'down'): number {
  if (direction === 'up')   return Math.ceil(mins  / SNAP_INTERVAL_MIN) * SNAP_INTERVAL_MIN
  if (direction === 'down') return Math.floor(mins / SNAP_INTERVAL_MIN) * SNAP_INTERVAL_MIN
  return mins
}

export function snapTime(date: Date, direction: 'up' | 'down'): Date {
  const result  = new Date(date)
  const mins    = result.getMinutes()
  const snapped = snapMinutes(mins, direction)
  result.setSeconds(0, 0)
  if (snapped >= 60) {
    result.setHours(result.getHours() + 1)
    result.setMinutes(0)
  } else {
    result.setMinutes(snapped)
  }
  return result
}

// ── Late grace period: arrivals up to GRACE_MIN minutes late are not penalised ─
export const LATE_GRACE_MIN = 4

export function computeClockIn(params: {
  rawTime:        Date
  scheduledStart: Date | null
  employmentType: string
}): { paidTime: Date; snapReason: string } {
  const { rawTime, scheduledStart, employmentType } = params

  // Salary: presence only — raw time recorded, no pay calculation
  if (employmentType === 'salary') {
    return { paidTime: rawTime, snapReason: 'salary_presence_only' }
  }

  // Casual or no scheduled start — snap UP to next 15min
  if (!scheduledStart || employmentType === 'casual') {
  // 2-minute grace: if within 2 mins of next 15min mark, round UP instead
  const minsIntoInterval = rawTime.getMinutes() % SNAP_INTERVAL_MIN
  const minsToNext = SNAP_INTERVAL_MIN - minsIntoInterval
  const paidTime = minsToNext <= 2
    ? snapTime(rawTime, 'up')
    : snapTime(rawTime, 'down')
    return {
      paidTime,
      snapReason: `casual_snapped_up_to_${fmtT(paidTime)}`,
    }
  }

  const diffMin = (rawTime.getTime() - scheduledStart.getTime()) / 60000

  // Early or on time — snap TO scheduled start
  if (diffMin <= 0) {
    return {
      paidTime:   scheduledStart,
      snapReason: `early_${Math.abs(Math.round(diffMin))}min_snapped_to_scheduled_${fmtT(scheduledStart)}`,
    }
  }

  // ── ✅ NEW: Within grace period (1-4 min late) — snap to scheduled start ─
  if (diffMin <= LATE_GRACE_MIN) {
    return {
      paidTime:   scheduledStart,
      snapReason: `late_${Math.round(diffMin)}min_within_grace_paid_from_${fmtT(scheduledStart)}`,
    }
  }

  // Late beyond grace — snap UP to next 15min interval
  const paidTime = snapTime(rawTime, 'up')
  return {
    paidTime,
    snapReason: `late_${Math.round(diffMin)}min_rounded_up_to_${fmtT(paidTime)}`,
  }
}
// ✅ Replace the entire computeClockOut function
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

  // Fixed staff: always paid to scheduled end regardless of when they leave
  if (employmentType === 'fixed' && scheduledEnd) {
    return {
      paidTime:   scheduledEnd,
      snapReason: `fixed_staff_paid_to_scheduled_end_${fmtT(scheduledEnd)}`,
    }
  }

  // Snap down to last 15min interval
  const paidTime = snapTime(rawTime, 'down')

  // Safety: never go before paid start — use snapped raw, not paidStart
  // This handles early clock-out where paidStart was snapped forward
  if (paidTime.getTime() <= paidStart.getTime()) {
    const snappedRaw = snapTime(rawTime, 'down')
    // If raw itself is before paidStart, give zero hours (snap to paidStart)
    // but only if they've actually worked some time
    const rawDiffMin = (rawTime.getTime() - paidStart.getTime()) / 60000
    if (rawDiffMin < 0) {
      // Clocked out before shift paid start — zero hours
      return {
        paidTime:   paidStart,
        snapReason: 'clock_out_before_shift_start_zero_hours',
      }
    }
    // Worked less than 15min — pay from paidStart to snapped raw (or paidStart if same)
    return {
      paidTime:   paidStart,
      snapReason: `clock_out_under_15min_paid_from_${fmtT(paidStart)}`,
    }
  }

  return {
    paidTime,
    snapReason: `snapped_down_to_${fmtT(paidTime)}`,
  }
}

function fmtT(d: Date): string {
  return d.toTimeString().slice(0, 5)
}

export function haversineDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R    = 6371000  // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function computeTrustScore(params: {
  gpsValid:     boolean
  distanceM:    number | null
  radiusM:      number
  ipMatchesSite: boolean
}): { score: number; flags: string[] } {
  let score         = 100
  const flags: string[] = []
  const { gpsValid, distanceM, radiusM, ipMatchesSite } = params

  if (!gpsValid || distanceM === null) {
    score -= 40
    flags.push('no_gps')
  } else if (distanceM > radiusM) {
    score -= 50
    flags.push(`gps_${Math.round(distanceM)}m_from_site`)
  }

  if (!ipMatchesSite) {
    score -= 15
    flags.push('off_site_ip')
  }

  return { score: Math.max(0, score), flags }
}