export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import WeeklyReportView from './weekly-report-view'
import { ArrowLeft } from 'lucide-react'

export default async function WeeklyReportPage() {
  const supabase = createAdminClient()

  // ── Cost settings ────────────────────────────────────────
  const { data: settings } = await supabase
    .from('cost_settings')
    .select('setting_key, value')

  const overheadPerKg = Number(
    settings?.find(s => s.setting_key === 'overhead_per_kg')?.value ?? 1.50
  )

  // ── Fetch ALL order items in pages of 1000 ───────────────
  let rawItems: any[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data: page, error } = await supabase
      .from('order_items')
      .select(`
        subtotal,
        quantity,
        product_name,
        product_id,
        gst_applicable,
        order_id,
        orders!inner (
          id,
          delivery_date,
          status,
          customer_id
        )
      `)
      .gte('orders.delivery_date', '2026-01-01')
      .range(from, from + pageSize - 1)

    if (error || !page || page.length === 0) break
    rawItems = rawItems.concat(page)
    if (page.length < pageSize) break
    from += pageSize
  }

  console.log('[weekly] total rawItems fetched:', rawItems.length)

  // ── Filter out cancelled in JS (join filter unreliable) ──
  const items = (rawItems ?? [])
    .filter(item => {
      const o = item.orders as any
      return o?.status === 'invoiced' || o?.status === 'pending'
    })
    .map(item => ({
      ...item,
      orders: (item.orders as unknown) as {
        id: string
        delivery_date: string
        status: string
        customer_id: string | null
      } | null,
    }))
  
  console.log('[weekly] total items after filter:', items.length)

  // ── Fetch all products with weight ────────────────────────
  const { data: products } = await supabase
    .from('products')
    .select('id, weight_grams')

  const productWeightMap = new Map<string, number>()
  for (const p of products ?? []) {
    if (p.weight_grams) productWeightMap.set(p.id, Number(p.weight_grams))
  }

  // ── Fetch all recipes linked to products ─────────────────
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, product_id')
    .not('product_id', 'is', null)

  const productRecipeMap = new Map<string, string>()
  const allRecipeIds: string[] = []
  for (const r of recipes ?? []) {
    if (r.product_id) {
      productRecipeMap.set(r.product_id, r.id)
      allRecipeIds.push(r.id)
    }
  }

  // ── Build product ingredient cost map ────────────────────
  const productIngCostMap = new Map<string, number>()

  if (allRecipeIds.length > 0) {
    const { data: topLines } = await supabase
      .from('recipe_lines')
      .select(`
        recipe_id,
        ingredient_id,
        quantity_grams,
        sub_recipe_id,
        sub_qty_grams,
        ingredients ( unit_cost )
      `)
      .in('recipe_id', allRecipeIds)

    const subRecipeIds = [...new Set(
      (topLines ?? [])
        .filter(l => l.sub_recipe_id)
        .map(l => l.sub_recipe_id as string)
    )]

    let subLines: any[] = []
    if (subRecipeIds.length > 0) {
      const { data: subData } = await supabase
        .from('recipe_lines')
        .select(`
          recipe_id,
          ingredient_id,
          quantity_grams,
          sub_recipe_id,
          sub_qty_grams,
          ingredients ( unit_cost )
        `)
        .in('recipe_id', subRecipeIds)
      subLines = subData ?? []
    }

    const subSubRecipeIds = [...new Set(
      subLines
        .filter(l => l.sub_recipe_id)
        .map(l => l.sub_recipe_id as string)
    )]

    let subSubLines: any[] = []
    if (subSubRecipeIds.length > 0) {
      const { data: subSubData } = await supabase
        .from('recipe_lines')
        .select(`
          recipe_id,
          ingredient_id,
          quantity_grams,
          sub_recipe_id,
          sub_qty_grams,
          ingredients ( unit_cost )
        `)
        .in('recipe_id', subSubRecipeIds)
      subSubLines = subSubData ?? []
    }

    const linesByRecipe = new Map<string, any[]>()
    for (const line of [...(topLines ?? []), ...subLines, ...subSubLines]) {
      if (!linesByRecipe.has(line.recipe_id)) {
        linesByRecipe.set(line.recipe_id, [])
      }
      linesByRecipe.get(line.recipe_id)!.push(line)
    }

    function calcCpg(recipeId: string, depth = 0): number {
      if (depth > 3) return 0
      const lines = linesByRecipe.get(recipeId) ?? []
      let totalCost   = 0
      let totalWeight = 0
      for (const line of lines) {
        if (line.ingredient_id && line.ingredients) {
          const qty  = Number(line.quantity_grams ?? 0)
          const cost = Number(line.ingredients.unit_cost ?? 0)
          totalCost   += (qty / 1000) * cost
          totalWeight += qty
        } else if (line.sub_recipe_id) {
          const subCpg = calcCpg(line.sub_recipe_id, depth + 1)
          const qty    = Number(line.sub_qty_grams ?? 0)
          totalCost   += qty * subCpg
          totalWeight += qty
        }
      }
      return totalWeight > 0 ? totalCost / totalWeight : 0
    }

    for (const [productId, recipeId] of productRecipeMap.entries()) {
      const productWeight = productWeightMap.get(productId)
      if (!productWeight) continue
      const lines        = linesByRecipe.get(recipeId) ?? []
      const recipeWeight = lines.reduce((s, l) =>
        s + Number(l.quantity_grams ?? l.sub_qty_grams ?? 0), 0)
      if (recipeWeight < productWeight * 0.5) continue
      const cpg = calcCpg(recipeId)
      if (cpg > 0) productIngCostMap.set(productId, productWeight * cpg)
    }
  }

  // ── Weight map for overhead calc ─────────────────────────
  const weekWeightMap = new Map<string, number>()
  for (const item of items) {
    const order = item.orders
    if (!order?.delivery_date) continue
    const weightGrams = item.product_id ? productWeightMap.get(item.product_id) : null
    if (!weightGrams) continue
    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]
    weekWeightMap.set(weekKey,
      (weekWeightMap.get(weekKey) ?? 0) + Number(item.quantity) * weightGrams
    )
  }

  // ── Group by week ─────────────────────────────────────────
  const weekMap = new Map<string, {
    week_start:        string
    first_day:         string
    last_day:          string
    order_ids:         Set<string>
    revenue:           number
    invoiced_revenue:  number
    pending_revenue:   number
    customers:         Set<string>
    ingredient_actual: number
    ingredient_est:    number
    item_count:        number
    actual_item_count: number
  }>()

  for (const item of items) {
    const order = item.orders
    if (!order?.delivery_date) continue

    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        week_start:        weekKey,
        first_day:         order.delivery_date,
        last_day:          order.delivery_date,
        order_ids:         new Set(),
        revenue:           0,
        invoiced_revenue:  0,
        pending_revenue:   0,
        customers:         new Set(),
        ingredient_actual: 0,
        ingredient_est:    0,
        item_count:        0,
        actual_item_count: 0,
      })
    }

    const week     = weekMap.get(weekKey)!
    const subtotal = Number(item.subtotal ?? 0)
    const exGst    = item.gst_applicable ? subtotal / 1.1 : subtotal

    week.order_ids.add(order.id)
    week.revenue += exGst
    if (order.status === 'invoiced') week.invoiced_revenue += exGst
    if (order.status === 'pending')  week.pending_revenue  += exGst
    if (order.customer_id) week.customers.add(order.customer_id)
    if (order.delivery_date < week.first_day) week.first_day = order.delivery_date
    if (order.delivery_date > week.last_day)  week.last_day  = order.delivery_date

    week.item_count++

    const ingCostUnit = item.product_id
      ? productIngCostMap.get(item.product_id)
      : undefined

    if (ingCostUnit !== undefined && ingCostUnit > 0) {
      week.ingredient_actual += ingCostUnit * Number(item.quantity ?? 1)
      week.actual_item_count++
    } else {
      week.ingredient_est += exGst * 0.30
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]

  const weeks = Array.from(weekMap.values())
    .map(w => ({
      week_start:        w.week_start,
      first_day:         w.first_day,
      last_day:          w.last_day,
      order_count:       w.order_ids.size,
      revenue:           w.revenue,
      invoiced_revenue:  w.invoiced_revenue,
      pending_revenue:   w.pending_revenue,
      customer_count:    w.customers.size,
      total_weight_kg:   (weekWeightMap.get(w.week_start) ?? 0) / 1000,
      ingredient_actual: w.ingredient_actual,
      ingredient_est:    w.ingredient_est,
      ingredient_total:  w.ingredient_actual + w.ingredient_est,
      has_any_actual:    w.actual_item_count > 0,
      all_actual:        w.actual_item_count === w.item_count && w.item_count > 0,
      actual_item_count: w.actual_item_count,
      item_count:        w.item_count,
    }))
    .filter(w => w.week_start <= todayStr)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 12)

  // ── Top products per week ─────────────────────────────────
  const weekProductMap = new Map<string, Map<string, {
    name: string; qty: number; revenue: number
  }>>()

  for (const item of items) {
    const order = item.orders
    if (!order?.delivery_date) continue
    const date = new Date(order.delivery_date + 'T00:00:00Z')
    const sun  = new Date(date)
    sun.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = sun.toISOString().split('T')[0]
    if (!weekProductMap.has(weekKey)) weekProductMap.set(weekKey, new Map())
    const pMap = weekProductMap.get(weekKey)!
    const name = item.product_name ?? 'Unknown'
    if (!pMap.has(name)) pMap.set(name, { name, qty: 0, revenue: 0 })
    const p = pMap.get(name)!
    p.qty     += Number(item.quantity ?? 0)
    p.revenue += item.gst_applicable
      ? Number(item.subtotal ?? 0) / 1.1
      : Number(item.subtotal ?? 0)
  }

  const topProductsByWeek: Record<string, {
    name: string; qty: number; revenue: number
  }[]> = {}
  weekProductMap.forEach((pMap, weekKey) => {
    topProductsByWeek[weekKey] = Array.from(pMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  })

  // ── Saved wages ───────────────────────────────────────────
  const { data: wagesData } = await supabase
    .from('weekly_wages')
    .select('week_start, wages')

  const savedWages: Record<string, number> = {}
  for (const w of wagesData ?? []) {
    savedWages[w.week_start] = Number(w.wages)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </a>

      <WeeklyReportView
        weeks={weeks}
        topProductsByWeek={topProductsByWeek}
        thisWeekStart={weeks[0]?.week_start ?? ''}
        overheadPerKg={overheadPerKg}
        savedWages={savedWages}
      />
    </div>
  )
}