// app/api/admin/roster/apply-template/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { week_start } = await request.json()
  if (!week_start) {
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build week dates (Sun-Sat)
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(week_start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().split('T')[0])
  }

  // Fetch all active staff
  const { data: staffList } = await supabase
    .from('staff')
    .select('id, employment_type, primary_department, break_minutes, base_hourly_rate, saturday_rate, sunday_rate, public_holiday_rate, public_holiday_multiplier, overtime_threshold_hours, overtime_multiplier, double_time_threshold_hours, double_time_multiplier, salary_weekly, salary_hours_per_week, super_rate_percent, true_hourly_cost')
    .eq('active', true)

  if (!staffList?.length) {
    return NextResponse.json({ success: true, created: 0, message: 'No active staff' })
  }

  // Fetch all templates
  const { data: templates } = await supabase
    .from('roster_templates')
    .select('*')
    .in('staff_id', staffList.map(s => s.id))

  if (!templates?.length) {
    return NextResponse.json({ success: true, created: 0, message: 'No templates found' })
  }

  const staffMap = new Map(staffList.map(s => [s.id, s]))
  const toInsert: any[] = []

  templates.forEach(t => {
    if (!t.is_working_day) return

    const dateStr = weekDates[t.day_of_week] // 0=Sun, 1=Mon, etc.
    if (!dateStr) return

    const staff = staffMap.get(t.staff_id)
    if (!staff) return

    const dow = new Date(dateStr + 'T00:00:00').getDay()
    const dayType = dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'normal'

    toInsert.push({
      staff_id:                    t.staff_id,
      work_date:                   dateStr,
      section:                     1,
      department:                  staff.primary_department,
      scheduled_start:             t.scheduled_start,
      scheduled_end:               t.scheduled_end,
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
      break_minutes:               staff.break_minutes,
      day_type:                    dayType,
      status:                      'scheduled',
    })
  })

  if (toInsert.length === 0) {
    return NextResponse.json({ success: true, created: 0, message: 'No working days in templates' })
  }

  const { error } = await supabase
    .from('roster_entries')
    .upsert(toInsert, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, created: toInsert.length })
}