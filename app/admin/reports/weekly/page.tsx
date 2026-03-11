export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import WeeklyReportView from './weekly-report-view'

export default async function WeeklyReportPage() {
  const supabase = createAdminClient()

  // ── Cost settings ──────────────────────────────────────────
  const { data: settings } = await supabase
    .from('cost_settings')
    .select('setting_key, value')

  const overheadPerKg = Number(
    settings?.find(s => s.setting_key === 'overhead_per_kg')?.value ?? 1.50
  )

  // ── Fetch order items ──────────────────────────────────────
  const { data: items } = await supabase
    .from('order_items')
    .select(`
      subtotal,
      quantity,
      product_name,
      orders!inner (
        id,
        delivery_date,
        status,
        customer_id
      )
    `)
    .in('orders.status', ['invoiced', 'pending'])
    .gte('orders.delivery_date', '2026-01-01')

  // ── Fetch weight data ──────────────────────────────────────
  const { data: weightItems } = await supabase
    .from('order_items')
    .select(`
      quantity,
      orders!inner (
        delivery_date,
        status
      ),
      products (
        weight_grams
      )
    `)
    .in('orders.status', ['invoiced', 'pending'])
    .gte('orders.delivery_date', '2026-01-01')

  // ── Group weight by week ───────────────────────────────────
  const weekWeightMap = new Map<string, number>()
  for (const item of weightItems ?? []) {
    const order   = item.orders as any
    const product = item.products as any
    if (!order?.delivery_date || !product?.weight_grams) continue
    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]
    const grams   = Number(item.quantity) * Number(product.weight_grams)
    weekWeightMap.set(weekKey, (weekWeightMap.get(weekKey) ?? 0) + grams)
  }

  // ── Group revenue by week ──────────────────────────────────
  const weekMap = new Map<string, {
    week_start:       string
    first_day:        string
    last_day:         string
    order_ids:        Set<string>
    revenue:          number
    invoiced_revenue: number
    pending_revenue:  number
    customers:        Set<string>
  }>()

  for (const item of items ?? []) {
    const order = item.orders as any
    if (!order?.delivery_date) continue
    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        week_start:       weekKey,
        first_day:        order.delivery_date,
        last_day:         order.delivery_date,
        order_ids:        new Set(),
        revenue:          0,
        invoiced_revenue: 0,
        pending_revenue:  0,
        customers:        new Set(),
      })
    }

    const week     = weekMap.get(weekKey)!
    const subtotal = Number(item.subtotal ?? 0)
    week.order_ids.add(order.id)
    week.revenue          += subtotal
    if (order.status === 'invoiced') week.invoiced_revenue += subtotal
    if (order.status === 'pending')  week.pending_revenue  += subtotal
    if (order.customer_id) week.customers.add(order.customer_id)
    if (order.delivery_date < week.first_day) week.first_day = order.delivery_date
    if (order.delivery_date > week.last_day)  week.last_day  = order.delivery_date
  }

  const weeks = Array.from(weekMap.values())
    .map(w => ({
      week_start:       w.week_start,
      first_day:        w.first_day,
      last_day:         w.last_day,
      order_count:      w.order_ids.size,
      revenue:          w.revenue,
      invoiced_revenue: w.invoiced_revenue,
      pending_revenue:  w.pending_revenue,
      customer_count:   w.customers.size,
      total_weight_kg:  (weekWeightMap.get(w.week_start) ?? 0) / 1000,
    }))
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 12)

  // ── Top products per week ──────────────────────────────────
  const { data: allWeekItems } = await supabase
    .from('order_items')
    .select(`
      product_name,
      quantity,
      subtotal,
      orders!inner ( delivery_date, status )
    `)
    .in('orders.status', ['invoiced', 'pending'])
    .gte('orders.delivery_date', '2026-01-01')

  const weekProductMap = new Map<string, Map<string, { name: string; qty: number; revenue: number }>>()
  for (const item of allWeekItems ?? []) {
    const order = item.orders as any
    if (!order?.delivery_date) continue
    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]

    if (!weekProductMap.has(weekKey)) weekProductMap.set(weekKey, new Map())
    const productMap = weekProductMap.get(weekKey)!
    const name = item.product_name ?? 'Unknown'
    if (!productMap.has(name)) productMap.set(name, { name, qty: 0, revenue: 0 })
    const p = productMap.get(name)!
    p.qty     += Number(item.quantity ?? 0)
    p.revenue += Number(item.subtotal ?? 0)
  }

  const topProductsByWeek: Record<string, { name: string; qty: number; revenue: number }[]> = {}
  weekProductMap.forEach((productMap, weekKey) => {
    topProductsByWeek[weekKey] = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  })

  // ── Fetch saved wages ──────────────────────────────────────
  const { data: wagesData } = await supabase
    .from('weekly_wages')
    .select('week_start, wages, notes')

  const savedWages: Record<string, number> = {}
  for (const w of wagesData ?? []) {
    savedWages[w.week_start] = Number(w.wages)
  }

  const thisWeekStart = weeks[0]?.week_start

  return (
    <WeeklyReportView
      weeks={weeks}
      topProductsByWeek={topProductsByWeek}
      thisWeekStart={thisWeekStart ?? ''}
      overheadPerKg={overheadPerKg}
      savedWages={savedWages}
    />
  )
}