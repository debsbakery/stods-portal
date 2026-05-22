// POST /api/admin/shifts/[id]/approve
// Body: { approved_by_id: string }  — auth user UUID
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const body = await req.json()
  const authUserId = body.approved_by_id

  if (!authUserId) {
    return NextResponse.json({ error: 'approved_by_id is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // approved_by is FK to staff table — need to find staff record for this auth user
  // For now, set approved_by to null and store manager note instead
  const { data, error } = await supabase
    .from('shifts')
    .update({
      status:       'approved',
      approved_by:  null,
      approved_at:  now,
      manager_note: `Approved by auth:${authUserId.slice(0, 8)}`,
    })
    .eq('id', params.id)
    .select(`
      id, staff_id, work_date, effective_start, effective_end,
      paid_hours, gross_pay, status, approved_by, approved_at, manager_note
    `)
    .single()

  if (error) {
    console.error('[approve shift]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ shift: data })
}