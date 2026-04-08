import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET — fetch all ingredients with current stock
export async function GET(req: Request) {
  try {
    const supabase = createAdminClient()

    const { data: ingredients, error } = await supabase
      .from('ingredients')
      .select('id, name, unit, unit_cost, current_stock, category, supplier_id, is_active, reorder_point')
      .eq('is_active', true)
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: ingredients?.map(i => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        unit_cost: Number(i.unit_cost),
        current_stock: i.current_stock || 0,
        category: i.category,
        supplier_id: i.supplier_id,
        is_active: i.is_active,
        reorder_point: i.reorder_point || 0
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}

// POST — create new ingredient
export async function POST(req: Request) {
  try {
    const { name, unit, unit_cost, category, supplier_id, current_stock, reorder_point } = await req.json()

    if (!name || !unit || typeof unit_cost !== 'number' || unit_cost < 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: ingredient, error } = await supabase
      .from('ingredients')
      .insert({
        name,
        unit,
        unit_cost,
        category: category || null,
        supplier_id: supplier_id || null,
        current_stock: current_stock || 0,
        reorder_point: reorder_point || null,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ingredient })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT — update existing ingredient + log price history if cost changed
export async function PUT(req: Request) {
  try {
    const { id, name, unit, unit_cost, previous_cost, category, supplier_id, reorder_point } = await req.json()

    if (!id || !name || !unit || typeof unit_cost !== 'number' || unit_cost < 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const updateData: any = {
      name,
      unit,
      unit_cost
    }

    if (category !== undefined) updateData.category = category
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id
    if (reorder_point !== undefined) updateData.reorder_point = reorder_point

    const { data: ingredient, error } = await supabase
      .from('ingredients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log to price history if cost changed
    if (previous_cost !== null && previous_cost !== undefined && previous_cost !== unit_cost) {
      await supabase.from('ingredient_price_history').insert({
        ingredient_id: id,
        unit_cost: unit_cost,
        effective_date: new Date().toISOString().split('T')[0],
        notes: `Price changed from $${previous_cost} to $${unit_cost}`,
      })
    }

    return NextResponse.json({ ingredient })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — remove ingredient
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('ingredients')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}