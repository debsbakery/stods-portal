// app/api/admin/staff/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

// ── Helper: compute true hourly cost ─────────────────────────────────────────
function computeTrueHourlyCost(data: any): number {
  if (data.employment_type === 'salary') {
    const weekly   = Number(data.salary_weekly ?? 0)
    const hrs      = Number(data.salary_hours_per_week ?? 38)
    const hourly   = hrs > 0 ? weekly / hrs : 0
    const superC   = hourly * (Number(data.super_rate_percent ?? 11.5) / 100)
    const leaveH   = (Number(data.annual_leave_hours_per_year ?? 152) / 52) / hrs
    const leaveL   = hourly * leaveH * (Number(data.leave_loading_percent ?? 17.5) / 100)
    return Math.round((hourly + superC + leaveL) * 100) / 100
  }
  const base     = Number(data.base_hourly_rate ?? 0)
  const superC   = base * (Number(data.super_rate_percent ?? 11.5) / 100)
  const leaveH   = (Number(data.annual_leave_hours_per_year ?? 152) / 52) / 38
  const leaveL   = base * leaveH * (Number(data.leave_loading_percent ?? 17.5) / 100)
  return Math.round((base + superC + leaveL) * 100) / 100
}

// ── GET — list all staff ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data ?? [] })
}

// ── POST — create staff member ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body     = await request.json()
  const supabase = createAdminClient()

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.pin || String(body.pin).length !== 4) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }
  if (!body.employment_type) {
    return NextResponse.json({ error: 'Employment type is required' }, { status: 400 })
  }

  const trueHourlyCost = computeTrueHourlyCost(body)

  const { data, error } = await supabase
    .from('staff')
    .insert({
      name:                        body.name.trim(),
      pin:                         String(body.pin),   // hash in production
      role:                        body.role                        ?? 'staff',
      employment_type:             body.employment_type,
      primary_department:          body.primary_department          ?? 'production',
      secondary_department:        body.secondary_department        ?? null,
      cost_centre:                 body.cost_centre                 ?? null,
      base_hourly_rate:            body.base_hourly_rate            ?? null,
      saturday_rate:               body.saturday_rate               ?? null,
      sunday_rate:                 body.sunday_rate                 ?? null,
      public_holiday_rate:         body.public_holiday_rate         ?? null,
      public_holiday_multiplier:   body.public_holiday_multiplier   ?? 2.0,
      overtime_threshold_hours:    body.overtime_threshold_hours    ?? null,
      overtime_multiplier:         body.overtime_multiplier         ?? 1.5,
      double_time_threshold_hours: body.double_time_threshold_hours ?? null,
      double_time_multiplier:      body.double_time_multiplier      ?? 2.0,
      salary_weekly:               body.salary_weekly               ?? null,
      salary_annual:               body.salary_annual               ?? null,
      salary_hours_per_week:       body.salary_hours_per_week       ?? 38.0,
      annual_leave_hours_per_year: body.annual_leave_hours_per_year ?? 152.0,
      sick_leave_hours_per_year:   body.sick_leave_hours_per_year   ?? 76.0,
      leave_loading_percent:       body.leave_loading_percent       ?? 17.5,
      super_rate_percent:          body.super_rate_percent          ?? 11.5,
      true_hourly_cost:            trueHourlyCost,
      break_minutes:               body.break_minutes               ?? 30,
      tax_file_number:             body.tax_file_number             ?? null,
      start_date:                  body.start_date                  ?? null,
      active:                      true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Log initial pay history ───────────────────────────────────────────────
  await supabase.from('staff_pay_history').insert({
    staff_id:                    data.id,
    effective_from:              body.start_date ?? new Date().toISOString().split('T')[0],
    base_hourly_rate:            data.base_hourly_rate,
    saturday_rate:               data.saturday_rate,
    sunday_rate:                 data.sunday_rate,
    public_holiday_rate:         data.public_holiday_rate,
    public_holiday_multiplier:   data.public_holiday_multiplier,
    overtime_threshold_hours:    data.overtime_threshold_hours,
    overtime_multiplier:         data.overtime_multiplier,
    double_time_threshold_hours: data.double_time_threshold_hours,
    double_time_multiplier:      data.double_time_multiplier,
    salary_weekly:               data.salary_weekly,
    salary_annual:               data.salary_annual,
    salary_hours_per_week:       data.salary_hours_per_week,
    super_rate_percent:          data.super_rate_percent,
    true_hourly_cost:            trueHourlyCost,
    break_minutes:               data.break_minutes,
    change_reason:               'initial_setup',
  })

  return NextResponse.json({ success: true, staff: data })
}