import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { parseWeekStart, getWeekEnd, formatWeekStart } from '@/lib/week-utils'
import { format } from 'date-fns'

export async function GET(
  req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const weekStart = parseWeekStart(params.weekStart)
  const weekEnd   = getWeekEnd(weekStart)

  const [{ data: shops }, { data: daily }, { data: wages }, { data: settings }] =
    await Promise.all([
      supabase.from('shops').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('shop_daily_reports').select('*')
        .gte('report_date', formatWeekStart(weekStart))
        .lte('report_date', format(weekEnd, 'yyyy-MM-dd')),
      supabase.from('shop_weekly_wages').select('*')
        .eq('week_start', formatWeekStart(weekStart)),
      supabase.from('report_settings').select('*').single()
    ])

  return NextResponse.json({ shops, daily, wages, settings })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { dailyRows, wageRows } = await req.json()

  if (dailyRows?.length) {
    const { error } = await supabase
      .from('shop_daily_reports')
      .upsert(dailyRows, { onConflict: 'shop_id,report_date' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (wageRows?.length) {
    const { error } = await supabase
      .from('shop_weekly_wages')
      .upsert(wageRows, { onConflict: 'shop_id,week_start' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}