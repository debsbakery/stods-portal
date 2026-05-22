// app/api/clock/qr/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false, error: 'No token' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('staff_qr_codes')
    .select('id, location_id, active, staff_locations(id, name, latitude, longitude, radius_metres)')
    .eq('token', token)
    .eq('active', true)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired QR code' }, { status: 401 })
  }

  return NextResponse.json({
    valid:       true,
    location_id: data.location_id,
    location:    data.staff_locations,
  })
}