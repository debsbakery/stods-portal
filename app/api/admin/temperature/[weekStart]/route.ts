import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { weekStart } = params

  const { data, error } = await supabase
    .from('temperature_logs')
    .select('*')
    .eq('week_start', weekStart)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { weekStart } = params
  const { rows } = await req.json()

  const { error } = await supabase
    .from('temperature_logs')
    .upsert(rows, { onConflict: 'week_start,equipment_name,log_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}