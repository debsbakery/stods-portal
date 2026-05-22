// app/api/admin/roster/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

// ── GET — fetch roster for a specific week ────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get('week_start')  // YYYY-MM-DD (Sunday)

  if (!weekStart) {
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })
  }

  // Build the 7 dates for the week
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().split('T')[0])
  }
  const weekEnd = weekDates[6]

  const supabase = createAdminClient()

  // All active staff
  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, employment_type, primary_department, secondary_department, break_minutes, base_hourly_rate, salary_weekly, true_hourly_cost')
    .eq('active', true)
    .order('name')

  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })

  // All roster entries for this week
  const { data: entries, error: entErr } = await supabase
    .from('roster_entries')
    .select('*')
    .in('work_date', weekDates)
    .order('work_date')

  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  return NextResponse.json({
    staff:      staff ?? [],
    entries:    entries ?? [],
    week_dates: weekDates,
    week_start: weekStart,
    week_end:   weekEnd,
  })
}

// ── POST — generate roster for a week from templates ─────────────────────────
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { week_start } = body

  if (!week_start) {
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build week dates
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(week_start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().split('T')[0])
  }

  // Get all active staff + their templates
  const { data: staff } = await supabase
    .from('staff')
    .select(`
      id, employment_type, primary_department, break_minutes,
      base_hourly_rate, saturday_rate, sunday_rate, public_holiday_rate,
      public_holiday_multiplier, overtime_threshold_hours, overtime_multiplier,
      double_time_threshold_hours, double_time_multiplier,
      salary_weekly, salary_hours_per_week, super_rate_percent, true_hourly_cost
    `)
    .eq('active', true)

  const { data: templates } = await supabase
    .from('roster_templates')
    .select('*')
    .eq('is_working_day', true)

  if (!staff || !templates) {
    return NextResponse.json({ error: 'Failed to fetch staff or templates' }, { status: 500 })
  }

  const toInsert: any[] = []

  for (const s of staff) {
    const staffTemplates = templates.filter(t => t.staff_id === s.id)

    for (let i = 0; i < 7; i++) {
      const date      = weekDates[i]
      const dayOfWeek = (i === 0 ? 0 : i)  // 0=Sun, 1=Mon...
      const template  = staffTemplates.find(t => t.day_of_week === dayOfWeek)

      if (!template || !template.is_working_day) continue

      // Determine day type
      const dayType = dayOfWeek === 0 ? 'sunday'
        : dayOfWeek === 6 ? 'saturday'
        : 'normal'

      toInsert.push({
        staff_id:                    s.id,
        work_date:                   date,
        section:                     1,
        department:                  s.primary_department,
        scheduled_start:             template.scheduled_start,
        scheduled_end:               template.scheduled_end,
        employment_type:             s.employment_type,
        base_hourly_rate:            s.base_hourly_rate,
        saturday_rate:               s.saturday_rate,
        sunday_rate:                 s.sunday_rate,
        public_holiday_rate:         s.public_holiday_rate,
        public_holiday_multiplier:   s.public_holiday_multiplier,
        overtime_threshold_hours:    s.overtime_threshold_hours,
        overtime_multiplier:         s.overtime_multiplier,
        double_time_threshold_hours: s.double_time_threshold_hours,
        double_time_multiplier:      s.double_time_multiplier,
        salary_weekly:               s.salary_weekly,
        salary_hours_per_week:       s.salary_hours_per_week,
        super_rate_percent:          s.super_rate_percent,
        true_hourly_cost:            s.true_hourly_cost,
        break_minutes:               s.break_minutes,
        day_type:                    dayType,
        status:                      'scheduled',
      })
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ success: true, created: 0, message: 'No templates found' })
  }

  // Upsert (skip if already exists)
  const { error: upsertErr } = await supabase
    .from('roster_entries')
    .upsert(toInsert, { onConflict: 'staff_id,work_date,section', ignoreDuplicates: true })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, created: toInsert.length })
}