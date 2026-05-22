// app/api/admin/roster/entry/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body     = await request.json()
  const supabase = createAdminClient()

  const { staff_id, work_date, section = 1 } = body
  if (!staff_id || !work_date) {
    return NextResponse.json({ error: 'staff_id and work_date required' }, { status: 400 })
  }

  // Fetch current staff rates for snapshot
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('id', staff_id)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const dayOfWeek = new Date(work_date + 'T00:00:00').getDay()
  const dayType   = dayOfWeek === 0 ? 'sunday'
    : dayOfWeek === 6 ? 'saturday'
    : 'normal'

  const { data, error } = await supabase
    .from('roster_entries')
    .upsert({
      staff_id,
      work_date,
      section,
      department:                  body.department   ?? staff.primary_department,
      scheduled_start:             body.scheduled_start ?? null,
      scheduled_end:               body.scheduled_end   ?? null,
      employment_type:             staff.employment_type,
      base_hourly_rate:            staff.base_hourly_rate,
      saturday_rate:               staff.saturday_rate,
      sunday_rate:                 staff.sunday_rate,
      public_holiday_rate:         staff.public_holiday_rate,
      public_holiday_multiplier:   staff.public_holiday_multiplier,
      overtime_threshold_hours:    staff.overtime_threshold_hours,
      overtime_multiplier:         staff.overtime_multiplier,
      double_time_threshold_hours: staff.double_time_threshold_hours,
      double_time_multiplier:      staff.double_time_multiplier,
      salary_weekly:               staff.salary_weekly,
      salary_hours_per_week:       staff.salary_hours_per_week,
      super_rate_percent:          staff.super_rate_percent,
      true_hourly_cost:            staff.true_hourly_cost,
      break_minutes:               (() => {
        if (!body.scheduled_start || !body.scheduled_end) return staff.break_minutes
        const [sh, sm] = body.scheduled_start.split(':').map(Number)
        const [eh, em] = body.scheduled_end.split(':').map(Number)
        const grossMins = (eh * 60 + em) - (sh * 60 + sm)
        return grossMins >= 270 ? staff.break_minutes : 0
      })(),
      day_type:                    body.day_type ?? dayType,
      status:                      'scheduled',
    }, { onConflict: 'staff_id,work_date,section' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, entry: data })
}