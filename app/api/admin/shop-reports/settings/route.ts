import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { id, bookkeeper_email, bookkeeper_name, weekly_overhead } = await req.json()

  const { error } = await supabase
    .from('report_settings')
    .update({
      bookkeeper_email,
      bookkeeper_name,
      weekly_overhead: parseFloat(weekly_overhead) || 2000,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}