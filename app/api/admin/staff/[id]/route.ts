// app/api/admin/staff/[id]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

interface Params { params: { id: string } }

function computeTrueHourlyCost(data: any): number {
  if (data.employment_type === 'salary') {
    const weekly = Number(data.salary_weekly ?? 0)
    const hrs    = Number(data.salary_hours_per_week ?? 38)
    const hourly = hrs > 0 ? weekly / hrs : 0
    const superC = hourly * (Number(data.super_rate_percent ?? 11.5) / 100)
    const leaveH = (Number(data.annual_leave_hours_per_year ?? 152) / 52) / hrs
    const leaveL = hourly * leaveH * (Number(data.leave_loading_percent ?? 17.5) / 100)
    return Math.round((hourly + superC + leaveL) * 100) / 100
  }
  const base   = Number(data.base_hourly_rate ?? 0)
  const superC = base * (Number(data.super_rate_percent ?? 11.5) / 100)
  const leaveH = (Number(data.annual_leave_hours_per_year ?? 152) / 52) / 38
  const leaveL = base * leaveH * (Number(data.leave_loading_percent ?? 17.5) / 100)
  return Math.round((base + superC + leaveL) * 100) / 100
}

// ── GET single staff ──────────────────────────────────────────────────────────
export async function GET(_: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()

  const { data: staff, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const { data: history } = await supabase
    .from('staff_pay_history')
    .select('*')
    .eq('staff_id', params.id)
    .order('effective_from', { ascending: false })

  return NextResponse.json({ staff, pay_history: history ?? [] })
}

// ── PUT — update staff member ─────────────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body     = await request.json()
  const supabase = createAdminClient()

  // Fetch current staff to detect pay rate changes
  const { data: current } = await supabase
    .from('staff')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!current) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const trueHourlyCost = computeTrueHourlyCost({ ...current, ...body })

  // Partial update — only fields present in body
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  const fields = [
    'name','pin','role','employment_type','primary_department',
    'secondary_department','cost_centre','base_hourly_rate',
    'saturday_rate','sunday_rate','public_holiday_rate',
    'public_holiday_multiplier','overtime_threshold_hours',
    'overtime_multiplier','double_time_threshold_hours',
    'double_time_multiplier','salary_weekly','salary_annual',
    'salary_hours_per_week','annual_leave_hours_per_year',
    'sick_leave_hours_per_year','leave_loading_percent',
    'super_rate_percent','break_minutes','tax_file_number',
    'start_date','end_date','active',
  ]
  for (const f of fields) {
    if (f in body) updates[f] = body[f]
  }
  updates.true_hourly_cost = trueHourlyCost

  const { data, error } = await supabase
    .from('staff')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Log pay history if any rate changed ──────────────────────────────────
  const rateFields = [
    'base_hourly_rate','saturday_rate','sunday_rate',
    'public_holiday_rate','public_holiday_multiplier',
    'overtime_threshold_hours','overtime_multiplier',
    'double_time_threshold_hours','double_time_multiplier',
    'salary_weekly','salary_annual','salary_hours_per_week',
    'super_rate_percent','break_minutes',
  ]
  const rateChanged = rateFields.some(f => f in body && body[f] !== current[f])

  if (rateChanged) {
    // Close previous history record
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('staff_pay_history')
      .update({ effective_to: today })
      .eq('staff_id', params.id)
      .is('effective_to', null)

    // Insert new history record
    await supabase.from('staff_pay_history').insert({
      staff_id:                    params.id,
      effective_from:              today,
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
      change_reason:               body.change_reason ?? 'rate_update',
    })
  }

  return NextResponse.json({ success: true, staff: data, rate_changed: rateChanged })
}

// ── DELETE — deactivate (soft delete) ────────────────────────────────────────
export async function DELETE(_: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { error } = await supabase
    .from('staff')
    .update({ active: false, end_date: today, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}