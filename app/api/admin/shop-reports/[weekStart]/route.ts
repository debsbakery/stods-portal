import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createRouteHandlerClient({ cookies })
  const { weekStart } = params

  const [shops, daily, wages, settings, purchases] = await Promise.all([
    supabase.from('shops').select('id, name, sort_order, auto_gst').order('sort_order'),
    supabase.from('shop_daily_reports').select('*').gte('report_date', weekStart),
    supabase.from('shop_weekly_wages').select('*').eq('week_start', weekStart),
    supabase.from('report_settings').select('*').single(),
    supabase.from('shop_weekly_purchases').select('*').eq('week_start', weekStart),
  ])

  return NextResponse.json({
    shops:     shops.data     ?? [],
    daily:     daily.data     ?? [],
    wages:     wages.data     ?? [],
    settings:  settings.data  ?? null,
    purchases: purchases.data ?? [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { weekStart: string } }
) {
  const supabase = createRouteHandlerClient({ cookies })
  const { weekStart } = params
  const { dailyRows, wageRows, purchaseRows } = await req.json()

  const [dailyRes, wagesRes, purchasesRes] = await Promise.all([
    supabase.from('shop_daily_reports')
      .upsert(dailyRows, { onConflict: 'shop_id,report_date' }),
    supabase.from('shop_weekly_wages')
      .upsert(wageRows, { onConflict: 'shop_id,week_start' }),
    supabase.from('shop_weekly_purchases')
      .upsert(purchaseRows, { onConflict: 'week_start,supplier' }),
  ])

  const error = dailyRes.error || wagesRes.error || purchasesRes.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}