// app/api/admin/staff/refresh-qr/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { location_id } = await request.json()
  if (!location_id) {
    return NextResponse.json({ error: 'location_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Deactivate old token
  await supabase
    .from('staff_qr_codes')
    .update({ active: false })
    .eq('location_id', location_id)
    .eq('active', true)

  // Generate new token
  const { data, error } = await supabase
    .from('staff_qr_codes')
    .insert({
      location_id,
      token:      crypto.randomUUID(),
      valid_date: new Date().toISOString().split('T')[0],
      active:     true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, token: data.token })
}