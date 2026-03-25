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
  const wsStr     = formatWeekStart(weekStart)

  const [
    { data: shops },
    { data: daily },
    { data: wages },
    { data: settings },
    { data: purchases },
  ] = await Promise.all([
    supabase.from('shops')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('shop_daily_reports')
      .select('*')
      .gte('report_date', wsStr)
      .lte('report_date', format(weekEnd, 'yyyy-MM-dd')),
    supabase.from('shop_weekly_wages')
      .select('*')
      .eq('week_start', wsStr),
    supabase.from('report_settings')
      .select('*')
      .single(),
    supabase.from('shop_weekly_purchases')
      .select('*')
      .eq('week_start', wsStr),
  ])

  return NextResponse.json({
    shops:     shops     ?? [],
    daily:     daily     ?? [],
    wages:     wages     ?? [],
    settings:  settings  ?? null,
    purchases: purchases ?? [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { dailyRows, wageRows, purchaseRows } = await req.json()

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

  if (purchaseRows?.length) {
    const { error } = await supabase
      .from('shop_weekly_purchases')
      .upsert(purchaseRows, { onConflict: 'week_start,supplier' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}