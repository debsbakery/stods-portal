// GET /api/admin/payroll?week_start=YYYY-MM-DD
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')

  if (!weekStart) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  const weekEnd = (() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  })()

  const { data: shifts, error } = await supabase
    .from('shifts')
    .select(`
      id,
      staff_id,
      work_date,
      day_type,
      paid_hours,
      paid_minutes,
      gross_pay,
      true_shift_cost,
      super_amount,
      leave_loading_amount,
      applicable_rate,
      status,
      staff:staff_id (
        id,
        name,
        employment_type,
        base_hourly_rate
      )
    `)
    .gte('work_date', weekStart)
    .lte('work_date', weekEnd)
    .in('status', ['completed', 'approved', 'pending'])
    .order('work_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byStaff = new Map<string, {
    staff_id: string
    name: string
    employment_type: string
    base_hourly_rate: number | null
    shift_count: number
    total_paid_hours: number
    normal_hours: number
    saturday_hours: number
    sunday_hours: number
    public_holiday_hours: number
    leave_hours: number
    total_gross_pay: number
    total_super: number
    total_leave: number
    total_true_cost: number
    pending_approval: number
  }>()

  for (const s of shifts ?? []) {
    // @ts-ignore
    const staff = s.staff
    if (!byStaff.has(s.staff_id)) {
      byStaff.set(s.staff_id, {
        staff_id: s.staff_id,
        name: staff?.name ?? 'Unknown',
        employment_type: staff?.employment_type ?? 'casual',
        base_hourly_rate: staff?.base_hourly_rate ?? null,
        shift_count: 0,
        total_paid_hours: 0,
        normal_hours: 0,
        saturday_hours: 0,
        sunday_hours: 0,
        public_holiday_hours: 0,
        leave_hours: 0,
        total_gross_pay: 0,
        total_super: 0,
        total_leave: 0,
        total_true_cost: 0,
        pending_approval: 0,
      })
    }

    const entry = byStaff.get(s.staff_id)!
    const hrs = Number(s.paid_hours ?? 0)
    entry.shift_count++
    entry.total_paid_hours += hrs

    const dayType = (s as any).day_type ?? 'normal'
    if (dayType === 'saturday') entry.saturday_hours += hrs
    else if (dayType === 'sunday') entry.sunday_hours += hrs
    else if (dayType === 'public_holiday') entry.public_holiday_hours += hrs
    else if (dayType === 'leave') entry.leave_hours += hrs
    else entry.normal_hours += hrs

    entry.total_gross_pay += Number(s.gross_pay ?? 0)
    entry.total_super += Number(s.super_amount ?? 0)
    entry.total_leave += Number(s.leave_loading_amount ?? 0)
    entry.total_true_cost += Number(s.true_shift_cost ?? 0)
    if (s.status !== 'approved') entry.pending_approval++
  }

  const summary = Array.from(byStaff.values()).map(e => ({
    ...e,
    total_paid_hours: parseFloat(e.total_paid_hours.toFixed(2)),
    normal_hours: parseFloat(e.normal_hours.toFixed(2)),
    saturday_hours: parseFloat(e.saturday_hours.toFixed(2)),
    sunday_hours: parseFloat(e.sunday_hours.toFixed(2)),
    public_holiday_hours: parseFloat(e.public_holiday_hours.toFixed(2)),
    leave_hours: parseFloat(e.leave_hours.toFixed(2)),
    total_gross_pay: parseFloat(e.total_gross_pay.toFixed(2)),
    total_super: parseFloat(e.total_super.toFixed(2)),
    total_leave: parseFloat(e.total_leave.toFixed(2)),
    total_true_cost: parseFloat(e.total_true_cost.toFixed(2)),
  }))

  const totals = {
    total_paid_hours: parseFloat(summary.reduce((a, s) => a + s.total_paid_hours, 0).toFixed(2)),
    normal_hours: parseFloat(summary.reduce((a, s) => a + s.normal_hours, 0).toFixed(2)),
    saturday_hours: parseFloat(summary.reduce((a, s) => a + s.saturday_hours, 0).toFixed(2)),
    sunday_hours: parseFloat(summary.reduce((a, s) => a + s.sunday_hours, 0).toFixed(2)),
    public_holiday_hours: parseFloat(summary.reduce((a, s) => a + s.public_holiday_hours, 0).toFixed(2)),
    leave_hours: parseFloat(summary.reduce((a, s) => a + s.leave_hours, 0).toFixed(2)),
    total_gross_pay: parseFloat(summary.reduce((a, s) => a + s.total_gross_pay, 0).toFixed(2)),
    total_super: parseFloat(summary.reduce((a, s) => a + s.total_super, 0).toFixed(2)),
    total_true_cost: parseFloat(summary.reduce((a, s) => a + s.total_true_cost, 0).toFixed(2)),
    staff_count: summary.length,
    pending_approval: summary.reduce((a, s) => a + s.pending_approval, 0),
  }

  return NextResponse.json({ week_start: weekStart, week_end: weekEnd, summary, totals })
}