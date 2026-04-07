export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select(`
      id, name, unit, unit_cost, current_stock, reorder_point,
      supplier_id, suppliers ( id, name )
    `)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch consumption data from the view
  const { data: consumption } = await supabase
    .from('ingredient_consumption')
    .select('*')

  // Build consumption map
  const usageMap: Record<string, {
    kg_used_last_7_days: number
    kg_used_last_30_days: number
    kg_used_last_90_days: number
    daily_avg: number
    weekly_avg: number
    days_remaining: number | null
    weeks_remaining: number | null
    reorder_date: string | null
  }> = {}

  for (const c of consumption ?? []) {
    const dailyAvg = (c.kg_used_last_30_days || 0) / 30
    const weeklyAvg = dailyAvg * 7
    const ing = (ingredients ?? []).find(i => i.id === c.ingredient_id)
    const stock = ing?.current_stock ?? 0

    let daysRemaining: number | null = null
    let weeksRemaining: number | null = null
    let reorderDate: string | null = null

    if (dailyAvg > 0 && stock > 0) {
      daysRemaining = Math.round(stock / dailyAvg)
      weeksRemaining = Math.round((stock / weeklyAvg) * 10) / 10
      const reorder = new Date()
      reorder.setDate(reorder.getDate() + daysRemaining)
      reorderDate = reorder.toISOString().split('T')[0]
    }

    usageMap[c.ingredient_id] = {
      kg_used_last_7_days:  Math.round((c.kg_used_last_7_days  || 0) * 100) / 100,
      kg_used_last_30_days: Math.round((c.kg_used_last_30_days || 0) * 100) / 100,
      kg_used_last_90_days: Math.round((c.kg_used_last_90_days || 0) * 100) / 100,
      daily_avg:            Math.round(dailyAvg * 100) / 100,
      weekly_avg:           Math.round(weeklyAvg * 100) / 100,
      days_remaining:       daysRemaining,
      weeks_remaining:      weeksRemaining,
      reorder_date:         reorderDate,
    }
  }

  // Merge ingredients with usage data
  const enriched = (ingredients ?? []).map(i => ({
    ...i,
    usage: usageMap[i.id] || null,
  }))

  const lowStock = enriched.filter(i => {
    if (i.usage && i.usage.days_remaining !== null && i.usage.days_remaining <= 7) return true
    if ((i.reorder_point || 0) > 0 && (i.current_stock || 0) <= (i.reorder_point || 0)) return true
    return false
  })

  return NextResponse.json({
    ingredients: enriched,
    low_stock: lowStock,
  })
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { ingredient_id, adjustment_type, quantity, unit, reason, adjusted_by } = body

  if (!ingredient_id || !adjustment_type || quantity === undefined || quantity === 0) {
    return NextResponse.json(
      { error: 'ingredient_id, adjustment_type, and quantity are required' },
      { status: 400 }
    )
  }

  const adjustedQty = ['waste', 'usage'].includes(adjustment_type)
    ? -Math.abs(quantity)
    : adjustment_type === 'stocktake'
      ? quantity
      : Math.abs(quantity)

  const { data, error } = await supabase
    .from('stock_adjustments')
    .insert({
      ingredient_id,
      adjustment_type,
      quantity:    adjustedQty,
      unit:        unit || 'kg',
      reason:      reason || null,
      adjusted_by: adjusted_by || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: ingredient } = await supabase
    .from('ingredients')
    .select('id, name, current_stock')
    .eq('id', ingredient_id)
    .single()

  return NextResponse.json({
    adjustment: data,
    new_stock: ingredient?.current_stock ?? 0,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { ingredient_id, reorder_point } = body

  if (!ingredient_id) {
    return NextResponse.json({ error: 'ingredient_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ingredients')
    .update({ reorder_point: reorder_point ?? 0 })
    .eq('id', ingredient_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}