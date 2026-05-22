// POST /api/admin/shifts/[id]/override
// Body: { override_paid_minutes: number, reason: string, approved_by_id: string }
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const { override_paid_minutes, reason, approved_by_id } = await req.json()

  if (!override_paid_minutes || !reason || !approved_by_id) {
    return NextResponse.json(
      { error: 'override_paid_minutes, reason and approved_by_id are required' },
      { status: 400 }
    )
  }

  // Fetch current shift to recalculate pay
  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('staff_id, effective_start, effective_end, applicable_rate, break_minutes')
    .eq('id', params.id)
    .single()

  if (fetchErr || !shift) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  }

  const overridePaidHours = parseFloat((override_paid_minutes / 60).toFixed(4))
  const rate              = Number(shift.applicable_rate ?? 0)
  const newGrossPay       = rate > 0
    ? parseFloat((overridePaidHours * rate).toFixed(2))
    : null

  const now = new Date().toISOString()

  // Calculate new effective_end from effective_start + override minutes
  // (keeps the stored times honest for audit)
  let newEffectiveEnd: string | null = null
  if (shift.effective_start) {
    const end = new Date(shift.effective_start)
    end.setMinutes(end.getMinutes() + override_paid_minutes + (shift.break_minutes ?? 0))
    newEffectiveEnd = end.toISOString()
  }

  const { data, error } = await supabase
    .from('shifts')
    .update({
      paid_minutes:  override_paid_minutes,
      paid_hours:    overridePaidHours,
      gross_pay:     newGrossPay,
      effective_end: newEffectiveEnd,
      status:        'approved',
      approved_by:   approved_by_id,
      approved_at:   now,
      manager_note:  `Override: ${reason}`,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log override to clock_events — update the clock_out event
  await supabase
    .from('clock_events')
    .update({
      override_paid_time: newEffectiveEnd,
      override_reason:    reason,
      overridden_by:      approved_by_id,
      overridden_at:      now,
    })
    .eq('id', data.clock_out_id)

  return NextResponse.json({ shift: data })
}