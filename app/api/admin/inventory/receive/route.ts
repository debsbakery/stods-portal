export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const {
    ingredient_id, supplier_id, quantity_kg,
    unit_cost, total_cost, invoice_ref,
    received_date, notes,
  } = body

  if (!ingredient_id || !quantity_kg || !unit_cost) {
    return NextResponse.json(
      { error: 'ingredient_id, quantity_kg and unit_cost are required' },
      { status: 400 }
    )
  }

  // Insert receipt (triggers auto stock update + price update)
  const { data: receipt, error } = await supabase
    .from('ingredient_receipts')
    .insert({
      ingredient_id,
      supplier_id:   supplier_id || null,
      supplier:      null,
      quantity_kg:   parseFloat(quantity_kg),
      unit_cost:     parseFloat(unit_cost),
      total_cost:    parseFloat(total_cost),
      invoice_ref:   invoice_ref || null,
      received_date: received_date || new Date().toISOString().split('T')[0],
      notes:         notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update ingredient unit_cost to latest price
  await supabase
    .from('ingredients')
    .update({ unit_cost: parseFloat(unit_cost) })
    .eq('id', ingredient_id)

  // Add price history
  await supabase
    .from('ingredient_price_history')
    .insert({
      ingredient_id,
      unit_cost: parseFloat(unit_cost),
      effective_date: received_date || new Date().toISOString().split('T')[0],
    })

  return NextResponse.json({ receipt })
}