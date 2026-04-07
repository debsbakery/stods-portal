export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const ingredientId = searchParams.get('ingredient_id')

  // ── All ingredients with their current supplier ─────────────
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, unit, unit_cost, supplier_id, suppliers ( id, name )')
    .order('name', { ascending: true })

  // ── All purchase receipts ───────────────────────────────────
  let receiptQuery = supabase
    .from('ingredient_receipts')
    .select(`
      id,
      ingredient_id,
      supplier_id,
      supplier,
      quantity_kg,
      unit_cost,
      total_cost,
      received_date,
      invoice_ref,
      ingredients ( id, name, unit ),
      suppliers ( id, name )
    `)
    .order('received_date', { ascending: false })

  if (ingredientId) {
    receiptQuery = receiptQuery.eq('ingredient_id', ingredientId)
  }

  const { data: receipts } = await receiptQuery

  // ── All suppliers ───────────────────────────────────────────
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // ── Build price comparison per ingredient ───────────────────
  const ingredientMap: Record<string, {
    ingredient_id: string
    ingredient_name: string
    unit: string
    current_cost: number
    current_supplier: string | null
    suppliers: {
      supplier_id: string | null
      supplier_name: string
      last_price: number
      avg_price: number
      min_price: number
      max_price: number
      purchase_count: number
      last_purchase_date: string
      is_cheapest: boolean
    }[]
  }> = {}

  for (const receipt of receipts ?? []) {
    const ingId   = receipt.ingredient_id
    const ingName = (receipt.ingredients as any)?.name || 'Unknown'
    const ingUnit = (receipt.ingredients as any)?.unit || 'kg'
    const suppId  = receipt.supplier_id
    const suppName = (receipt.suppliers as any)?.name || receipt.supplier || 'Unknown'

    if (!ingredientMap[ingId]) {
      const ing = (ingredients ?? []).find(i => i.id === ingId)
      ingredientMap[ingId] = {
        ingredient_id:   ingId,
        ingredient_name: ingName,
        unit:            ingUnit,
        current_cost:    Number(ing?.unit_cost || 0),
        current_supplier: (ing?.suppliers as any)?.name || null,
        suppliers:       [],
      }
    }

    const entry = ingredientMap[ingId]
    const suppKey = suppId || suppName
    let suppEntry = entry.suppliers.find(s => (s.supplier_id || s.supplier_name) === suppKey)

    if (!suppEntry) {
      suppEntry = {
        supplier_id:        suppId,
        supplier_name:      suppName,
        last_price:         0,
        avg_price:          0,
        min_price:          Infinity,
        max_price:          0,
        purchase_count:     0,
        last_purchase_date: '',
        is_cheapest:        false,
      }
      entry.suppliers.push(suppEntry)
    }

    const price = Number(receipt.unit_cost)
    suppEntry.purchase_count++
    suppEntry.avg_price = ((suppEntry.avg_price * (suppEntry.purchase_count - 1)) + price) / suppEntry.purchase_count
    suppEntry.min_price = Math.min(suppEntry.min_price, price)
    suppEntry.max_price = Math.max(suppEntry.max_price, price)

    if (!suppEntry.last_purchase_date || receipt.received_date > suppEntry.last_purchase_date) {
      suppEntry.last_price         = price
      suppEntry.last_purchase_date = receipt.received_date
    }
  }

  // ── Mark cheapest supplier per ingredient ───────────────────
  const comparison = Object.values(ingredientMap)
  for (const item of comparison) {
    if (item.suppliers.length === 0) continue
    const cheapest = item.suppliers.reduce((min, s) =>
      s.last_price < min.last_price ? s : min
    )
    cheapest.is_cheapest = true

    // Round values
    for (const s of item.suppliers) {
      s.avg_price = Math.round(s.avg_price * 100) / 100
      s.min_price = s.min_price === Infinity ? 0 : Math.round(s.min_price * 100) / 100
      s.max_price = Math.round(s.max_price * 100) / 100
      s.last_price = Math.round(s.last_price * 100) / 100
    }

    // Sort suppliers by last_price ascending
    item.suppliers.sort((a, b) => a.last_price - b.last_price)
  }

  // Sort by ingredient name
  comparison.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name))

  return NextResponse.json({
    comparison,
    ingredients: ingredients ?? [],
    suppliers:   suppliers   ?? [],
    receipts:    receipts    ?? [],
  })
}