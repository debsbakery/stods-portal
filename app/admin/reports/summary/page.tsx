export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SummaryView from './summary-view'
import { ArrowLeft } from 'lucide-react'

export default async function SummaryPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()

  // ── Fetch shops ──────────────────────────────────────────
  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  // ── Cost settings (overhead_per_kg) ──────────────────────
  const { data: costSettings } = await supabase
    .from('cost_settings')
    .select('setting_key, value')

  const overheadPerKg = Number(
    costSettings?.find((s: any) => s.setting_key === 'overhead_per_kg')?.value ?? 1.50
  )

  // ── Report settings (weekly_overhead for shops) ──────────
  const { data: reportSettings } = await supabase
    .from('report_settings')
    .select('weekly_overhead')
    .single()

  const shopWeeklyOverhead = Number(reportSettings?.weekly_overhead ?? 0)

  // ── Fetch ALL order items (same as weekly report) ────────
  let rawItems: any[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data: page, error } = await supabase
      .from('order_items')
      .select(`
        subtotal, quantity, product_name, product_id, gst_applicable, order_id,
        orders!inner ( id, delivery_date, status, customer_id )
      `)
      .gte('orders.delivery_date', '2026-01-01')
      .range(from, from + pageSize - 1)

    if (error || !page || page.length === 0) break
    rawItems = rawItems.concat(page)
    if (page.length < pageSize) break
    from += pageSize
  }

  const items = (rawItems ?? [])
    .filter(item => {
      const o = item.orders as any
      return o?.status === 'invoiced' || o?.status === 'pending'
    })
    .map(item => ({
      ...item,
      orders: (item.orders as unknown) as {
        id: string; delivery_date: string; status: string; customer_id: string | null
      } | null,
    }))

  // ── Fetch products with weight ───────────────────────────
  const { data: products } = await supabase.from('products').select('id, weight_grams')
  const productWeightMap = new Map<string, number>()
  for (const p of products ?? []) {
    if (p.weight_grams) productWeightMap.set(p.id, Number(p.weight_grams))
  }

  // ── Recipe cost calculation (stolen from weekly report) ──
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

  const productIngCostMap = new Map<string, number>()

  if (allRecipeIds.length > 0) {
    const { data: topLines } = await supabase
      .from('recipe_lines')
      .select('recipe_id, ingredient_id, quantity_grams, sub_recipe_id, sub_qty_grams, ingredients ( unit_cost )')
      .in('recipe_id', allRecipeIds)

    const subRecipeIds = [...new Set(
      (topLines ?? []).filter(l => l.sub_recipe_id).map(l => l.sub_recipe_id as string)
    )]

    let subLines: any[] = []
    if (subRecipeIds.length > 0) {
      const { data } = await supabase
        .from('recipe_lines')
        .select('recipe_id, ingredient_id, quantity_grams, sub_recipe_id, sub_qty_grams, ingredients ( unit_cost )')
        .in('recipe_id', subRecipeIds)
      subLines = data ?? []
    }

    const subSubIds = [...new Set(subLines.filter(l => l.sub_recipe_id).map(l => l.sub_recipe_id as string))]
    let subSubLines: any[] = []
    if (subSubIds.length > 0) {
      const { data } = await supabase
        .from('recipe_lines')
        .select('recipe_id, ingredient_id, quantity_grams, sub_recipe_id, sub_qty_grams, ingredients ( unit_cost )')
        .in('recipe_id', subSubIds)
      subSubLines = data ?? []
    }

    const linesByRecipe = new Map<string, any[]>()
    for (const line of [...(topLines ?? []), ...subLines, ...subSubLines]) {
      if (!linesByRecipe.has(line.recipe_id)) linesByRecipe.set(line.recipe_id, [])
      linesByRecipe.get(line.recipe_id)!.push(line)
    }

    function calcCpg(recipeId: string, depth = 0): number {
      if (depth > 3) return 0
      const lines = linesByRecipe.get(recipeId) ?? []
      let totalCost = 0, totalWeight = 0
      for (const line of lines) {
        if (line.ingredient_id && line.ingredients) {
          const qty = Number(line.quantity_grams ?? 0)
          const cost = Number(line.ingredients.unit_cost ?? 0)
          totalCost += (qty / 1000) * cost
          totalWeight += qty
        } else if (line.sub_recipe_id) {
          const subCpg = calcCpg(line.sub_recipe_id, depth + 1)
          const qty = Number(line.sub_qty_grams ?? 0)
          totalCost += qty * subCpg
          totalWeight += qty
        }
      }
      return totalWeight > 0 ? totalCost / totalWeight : 0
    }

    for (const [productId, recipeId] of productRecipeMap.entries()) {
      const productWeight = productWeightMap.get(productId)
      if (!productWeight) continue
      const lines = linesByRecipe.get(recipeId) ?? []
      const recipeWeight = lines.reduce((s: number, l: any) =>
        s + Number(l.quantity_grams ?? l.sub_qty_grams ?? 0), 0)
      if (recipeWeight < productWeight * 0.5) continue
      const cpg = calcCpg(recipeId)
      if (cpg > 0) productIngCostMap.set(productId, productWeight * cpg)
    }
  }

  // ── Helper: get week start (Sunday) ──────────────────────
  function getWeekStart(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00Z')
    const day = date.getUTCDay()
    date.setUTCDate(date.getUTCDate() - day)
    return date.toISOString().split('T')[0]
  }

  // ── Build week map from order items ──────────────────────
  const weekMap = new Map<string, {
    week_start: string
    order_revenue: number
    order_count: number
    order_ids: Set<string>
    ingredient_cost: number
    weight_grams: number
    shop_sales: Record<string, number>
    shop_total_sales: number
    bakery_wages: number
    shop_wages: number
    shop_purchases: number
    shop_overhead: number
  }>()

  function ensureWeek(ws: string) {
    if (!weekMap.has(ws)) {
      weekMap.set(ws, {
        week_start: ws,
        order_revenue: 0,
        order_count: 0,
        order_ids: new Set(),
        ingredient_cost: 0,
        weight_grams: 0,
        shop_sales: {},
        shop_total_sales: 0,
        bakery_wages: 0,
        shop_wages: 0,
        shop_purchases: 0,
        shop_overhead: shopWeeklyOverhead,
      })
    }
    return weekMap.get(ws)!
  }

  for (const item of items) {
    const order = item.orders
    if (!order?.delivery_date) continue

    const ws = getWeekStart(order.delivery_date)
    const week = ensureWeek(ws)

    const subtotal = Number(item.subtotal ?? 0)
    const exGst = item.gst_applicable ? subtotal / 1.1 : subtotal

    week.order_ids.add(order.id)
    week.order_revenue += exGst

    // Ingredient cost
    const ingCostUnit = item.product_id ? productIngCostMap.get(item.product_id) : undefined
    if (ingCostUnit !== undefined && ingCostUnit > 0) {
      week.ingredient_cost += ingCostUnit * Number(item.quantity ?? 1)
    } else {
      week.ingredient_cost += exGst * 0.30 // fallback estimate
    }

    // Weight for overhead
    const weightGrams = item.product_id ? productWeightMap.get(item.product_id) : undefined
    if (weightGrams) {
      week.weight_grams += Number(item.quantity ?? 1) * weightGrams
    }
  }

  // Set order_count from unique order IDs
  for (const week of weekMap.values()) {
    week.order_count = week.order_ids.size
  }

  // ── Shop daily reports ───────────────────────────────────
  const { data: dailyReports } = await supabase
    .from('shop_daily_reports')
    .select('shop_id, report_date, sales')
    .gte('report_date', '2026-01-01')

  for (const report of (dailyReports ?? [])) {
    const ws = getWeekStart(report.report_date)
    const week = ensureWeek(ws)
    const sales = Number(report.sales || 0)
    week.shop_sales[report.shop_id] = (week.shop_sales[report.shop_id] || 0) + sales
    week.shop_total_sales += sales
  }

  // ── Bakery wages (weekly_wages table) ────────────────────
  const { data: bakeryWages } = await supabase
    .from('weekly_wages')
    .select('week_start, wages')

  for (const w of (bakeryWages ?? [])) {
    const week = ensureWeek(w.week_start)
    week.bakery_wages = Number(w.wages || 0)
  }

  // ── Shop weekly wages ────────────────────────────────────
  const { data: shopWages } = await supabase
    .from('shop_weekly_wages')
    .select('week_start, wages')

  for (const w of (shopWages ?? [])) {
    const week = ensureWeek(w.week_start)
    week.shop_wages += Number(w.wages || 0)
  }

  // ── Shop weekly purchases (cost of goods for shops) ──────
  const { data: shopPurchases } = await supabase
    .from('shop_weekly_purchases')
    .select('week_start, amount')

  for (const p of (shopPurchases ?? [])) {
    const week = ensureWeek(p.week_start)
    week.shop_purchases += Number(p.amount || 0)
  }

  // ── Build final weeks array ──────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const weeks = Array.from(weekMap.values())
    .filter(w => w.week_start <= todayStr)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map(w => ({
      week_start: w.week_start,
      order_revenue: Math.round(w.order_revenue * 100) / 100,
      order_count: w.order_count,
      ingredient_cost: Math.round(w.ingredient_cost * 100) / 100,
      overhead: Math.round((w.weight_grams / 1000) * overheadPerKg * 100) / 100,
      shop_sales: w.shop_sales,
      shop_total_sales: Math.round(w.shop_total_sales * 100) / 100,
      bakery_wages: w.bakery_wages,
      shop_wages: w.shop_wages,
      shop_purchases: Math.round(w.shop_purchases * 100) / 100,
      shop_overhead: w.shop_overhead,
    }))

  // ── Group by month ───────────────────────────────────────
  const monthMap = new Map<string, typeof weeks>()
  for (const week of weeks) {
    const date = new Date(week.week_start + 'T00:00:00')
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, [])
    monthMap.get(monthKey)!.push(week)
  }

  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthWeeks]) => ({
      monthKey,
      label: new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
      weeks: monthWeeks,
    }))

  return (
    <div className="container mx-auto px-4 py-8">
      <a href="/admin" className="flex items-center gap-1 text-sm mb-4 hover:opacity-80" style={{ color: '#CE1126' }}>
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </a>
      <SummaryView months={months} shops={shops ?? []} />
    </div>
  )
}