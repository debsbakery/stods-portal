// app/api/admin/roster/[entryId]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

interface Params { params: { entryId: string } }

// ── PUT — update one roster cell ──────────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body     = await request.json()
  const supabase = createAdminClient()

  const allowed = [
    'scheduled_start', 'scheduled_end', 'department',
    'day_type', 'public_holiday_name', 'status', 'manager_note',
  ]
  const updates: Record<string, any> = {}
  for (const f of allowed) {
    if (f in body) updates[f] = body[f]
  }

  const { data, error } = await supabase
    .from('roster_entries')
    .update(updates)
    .eq('id', params.entryId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, entry: data })
}

// ── DELETE — remove roster entry (mark rostered_off) ─────────────────────────
export async function DELETE(_: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('roster_entries')
    .delete()
    .eq('id', params.entryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}