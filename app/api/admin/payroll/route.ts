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

  // work_date is a DATE — plain string comparison works perfectly
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
    .in('status', ['completed', 'approved'])
    .order('work_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by staff_id
  const byStaff = new Map<string, {
    staff_id:          string
    name:         string
    employment_type:   string
    base_hourly_rate:  number | null
    shift_count:       number
    total_paid_hours:  number
    total_gross_pay:   number
    total_super:       number
    total_leave:       number
    total_true_cost:   number
    pending_approval:  number
  }>()

  for (const s of shifts ?? []) {
    // @ts-ignore — joined relation
    const staff = s.staff
    if (!byStaff.has(s.staff_id)) {
      byStaff.set(s.staff_id, {
        staff_id:         s.staff_id,
        name:        staff?.name        ?? 'Unknown',
        employment_type:  staff?.employment_type  ?? 'casual',
        base_hourly_rate: staff?.base_hourly_rate ?? null,
        shift_count:      0,
        total_paid_hours: 0,
        total_gross_pay:  0,
        total_super:      0,
        total_leave:      0,
        total_true_cost:  0,
        pending_approval: 0,
      })
    }

    const entry = byStaff.get(s.staff_id)!
    entry.shift_count++
    entry.total_paid_hours += Number(s.paid_hours      ?? 0)
    entry.total_gross_pay  += Number(s.gross_pay       ?? 0)
    entry.total_super      += Number(s.super_amount    ?? 0)
    entry.total_leave      += Number(s.leave_loading_amount ?? 0)
    entry.total_true_cost  += Number(s.true_shift_cost ?? 0)
    if (s.status !== 'approved') entry.pending_approval++
  }

  const summary = Array.from(byStaff.values()).map(e => ({
    ...e,
    total_paid_hours: parseFloat(e.total_paid_hours.toFixed(2)),
    total_gross_pay:  parseFloat(e.total_gross_pay.toFixed(2)),
    total_super:      parseFloat(e.total_super.toFixed(2)),
    total_leave:      parseFloat(e.total_leave.toFixed(2)),
    total_true_cost:  parseFloat(e.total_true_cost.toFixed(2)),
  }))

  const totals = {
    total_paid_hours: parseFloat(summary.reduce((a, s) => a + s.total_paid_hours, 0).toFixed(2)),
    total_gross_pay:  parseFloat(summary.reduce((a, s) => a + s.total_gross_pay,  0).toFixed(2)),
    total_super:      parseFloat(summary.reduce((a, s) => a + s.total_super,      0).toFixed(2)),
    total_true_cost:  parseFloat(summary.reduce((a, s) => a + s.total_true_cost,  0).toFixed(2)),
    staff_count:      summary.length,
    pending_approval: summary.reduce((a, s) => a + s.pending_approval, 0),
  }

  return NextResponse.json({ week_start: weekStart, week_end: weekEnd, summary, totals })
}