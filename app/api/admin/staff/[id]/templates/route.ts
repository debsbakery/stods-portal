// app/api/admin/staff/[id]/templates/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

interface Params { params: { id: string } }

export async function GET(_: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('roster_templates')
    .select('*')
    .eq('staff_id', params.id)
    .order('day_of_week')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body     = await request.json()
  const supabase = createAdminClient()
  const { templates } = body  // array of { day_of_week, scheduled_start, scheduled_end, is_working_day }

  if (!Array.isArray(templates)) {
    return NextResponse.json({ error: 'templates array required' }, { status: 400 })
  }

  // Delete existing and re-insert (clean replace)
  await supabase.from('roster_templates').delete().eq('staff_id', params.id)

  const toInsert = templates
    .filter(t => t.is_working_day)
    .map(t => ({
      staff_id:        params.id,
      day_of_week:     t.day_of_week,
      scheduled_start: t.scheduled_start || null,
      scheduled_end:   t.scheduled_end   || null,
      is_working_day:  true,
    }))

  if (toInsert.length > 0) {
    const { error } = await supabase.from('roster_templates').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, saved: toInsert.length })
}