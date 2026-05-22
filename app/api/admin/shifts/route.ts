// GET /api/admin/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=optional
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)

  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const staffId  = searchParams.get('staff_id')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  // work_date is a plain DATE column — no timezone conversion needed
  let query = supabase
    .from('shifts')
    .select(`
      id,
      staff_id,
      work_date,
      effective_start,
      effective_end,
      paid_hours,
      paid_minutes,
      gross_minutes,
      break_minutes,
      gross_pay,
      true_shift_cost,
      applicable_rate,
      arrived_late_min,
      left_early_min,
      status,
      approved_by,
      approved_at,
      manager_note,
      roster_entry_id,
      staff:staff_id (
        id,
        name,
        employment_type,
        base_hourly_rate
      ),
      clock_in:clock_in_id (
        id,
        raw_time,
        paid_time,
        gps_lat,
        gps_lng,
        gps_valid,
        trust_score,
        snap_reason,
        flags
      ),
      clock_out:clock_out_id (
        id,
        raw_time,
        paid_time,
        gps_lat,
        gps_lng,
        gps_valid,
        trust_score,
        snap_reason,
        flags
      )
    `)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false })
    .order('effective_start', { ascending: true })

  if (staffId) query = query.eq('staff_id', staffId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ shifts: data ?? [] })
}