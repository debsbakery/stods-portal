// app/api/admin/roster/copy/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { from_week_start, to_week_start } = await request.json()

  if (!from_week_start || !to_week_start) {
    return NextResponse.json({ error: 'from_week_start and to_week_start required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build source week dates
  const fromDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(from_week_start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    fromDates.push(d.toISOString().split('T')[0])
  }

  // Build target week dates
  const toDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(to_week_start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    toDates.push(d.toISOString().split('T')[0])
  }

  // Fetch source week entries
  const { data: sourceEntries, error: fetchErr } = await supabase
    .from('roster_entries')
    .select('*')
    .in('work_date', fromDates)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!sourceEntries?.length) {
    return NextResponse.json({ success: true, copied: 0, message: 'No entries in source week' })
  }

  // Re-fetch current staff rates (in case rates changed since last week)
  const staffIds = [...new Set(sourceEntries.map(e => e.staff_id))]
  const { data: staffList } = await supabase
    .from('staff')
    .select('id, base_hourly_rate, saturday_rate, sunday_rate, public_holiday_rate, public_holiday_multiplier, overtime_threshold_hours, overtime_multiplier, double_time_threshold_hours, double_time_multiplier, salary_weekly, salary_hours_per_week, super_rate_percent, true_hourly_cost, break_minutes, employment_type')
    .in('id', staffIds)

  const staffMap = new Map((staffList ?? []).map(s => [s.id, s]))

  // Build new entries for target week
  const toInsert = sourceEntries.map((entry, idx) => {
    const dayOffset = fromDates.indexOf(entry.work_date)
    const newDate   = toDates[dayOffset]
    const staff     = staffMap.get(entry.staff_id)

    // Determine day type for new date
    const newDayOfWeek = new Date(newDate + 'T00:00:00').getDay()
    const dayType = entry.day_type === 'public_holiday' ? 'normal'  // reset PH — must be manually re-set
      : newDayOfWeek === 0 ? 'sunday'
      : newDayOfWeek === 6 ? 'saturday'
      : 'normal'

    return {
      staff_id:                    entry.staff_id,
      work_date:                   newDate,
      section:                     entry.section,
      department:                  entry.department,
      scheduled_start:             entry.scheduled_start,
      scheduled_end:               entry.scheduled_end,
      employment_type:             staff?.employment_type             ?? entry.employment_type,
      base_hourly_rate:            staff?.base_hourly_rate            ?? entry.base_hourly_rate,
      saturday_rate:               staff?.saturday_rate               ?? entry.saturday_rate,
      sunday_rate:                 staff?.sunday_rate                 ?? entry.sunday_rate,
      public_holiday_rate:         staff?.public_holiday_rate         ?? entry.public_holiday_rate,
      public_holiday_multiplier:   staff?.public_holiday_multiplier   ?? entry.public_holiday_multiplier,
      overtime_threshold_hours:    staff?.overtime_threshold_hours    ?? entry.overtime_threshold_hours,
      overtime_multiplier:         staff?.overtime_multiplier         ?? entry.overtime_multiplier,
      double_time_threshold_hours: staff?.double_time_threshold_hours ?? entry.double_time_threshold_hours,
      double_time_multiplier:      staff?.double_time_multiplier      ?? entry.double_time_multiplier,
      salary_weekly:               staff?.salary_weekly               ?? entry.salary_weekly,
      salary_hours_per_week:       staff?.salary_hours_per_week       ?? entry.salary_hours_per_week,
      super_rate_percent:          staff?.super_rate_percent          ?? entry.super_rate_percent,
      true_hourly_cost:            staff?.true_hourly_cost            ?? entry.true_hourly_cost,
      break_minutes:               staff?.break_minutes               ?? entry.break_minutes,
      day_type:                    dayType,
      public_holiday_name:         null,  // reset PH name
      status:                      'scheduled',
      manager_note:                null,
    }
  })

  const { error: upsertErr } = await supabase
    .from('roster_entries')
    .upsert(toInsert, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: false })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, copied: toInsert.length })
}