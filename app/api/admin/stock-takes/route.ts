export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const { data: stockTake, error: takeError } = await supabase
      .from('stock_takes')
      .select(`
        id,
        take_date,
        notes,
        status,
        created_at,
        completed_at,
        items:stock_take_items (
          id,
          ingredient_id,
          counted_packs,
          pack_size_kg,
          total_kg,
          notes,
          ingredients ( id, name, unit, unit_cost )
        )
      `)
      .eq('id', id)
      .single()

    if (takeError) return NextResponse.json({ error: takeError.message }, { status: 500 })
    return NextResponse.json({ data: stockTake })
  }

  const { data: stockTakes, error } = await supabase
    .from('stock_takes')
    .select('id, take_date, notes, status, created_at, completed_at')
    .order('take_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: stockTakes })
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = await req.json()
    const { take_date, notes, items } = body

    if (!take_date) {
      return NextResponse.json({ error: 'take_date required' }, { status: 400 })
    }

    const { data: stockTake, error: takeError } = await supabase
      .from('stock_takes')
      .insert({
        take_date,
        notes:  notes  || null,
        status: 'draft',
      })
      .select()
      .single()

    if (takeError) throw takeError

    if (items && items.length > 0) {
      const { error: itemsError } = await supabase
        .from('stock_take_items')
        .insert(
          items.map((i: any) => ({
            stock_take_id:  stockTake.id,
            ingredient_id:  i.ingredient_id,
            counted_packs:  i.counted_packs  ?? null,
            pack_size_kg:   i.pack_size_kg   ?? null,
            total_kg:       i.total_kg       ?? null,
            notes:          i.notes          || null,
          }))
        )

      if (itemsError) throw itemsError
    }

    return NextResponse.json({ data: stockTake }, { status: 201 })
  } catch (error: any) {
    console.error('Stock take error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = await req.json()
    const { id, take_date, notes, status, items } = body

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const updateData: any = {}
    if (take_date !== undefined) updateData.take_date = take_date
    if (notes !== undefined)     updateData.notes     = notes
    if (status !== undefined) {
      updateData.status = statusif (status === 'completed') updateData.completed_at = new Date().toISOString()
    }

    const { data: stockTake, error: takeError } = await supabase
      .from('stock_takes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (takeError) throw takeError

    if (items) {
      await supabase.from('stock_take_items').delete().eq('stock_take_id', id)

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('stock_take_items')
          .insert(
            items.map((i: any) => ({
              stock_take_id:  id,
              ingredient_id:  i.ingredient_id,
              counted_packs:  i.counted_packs  ?? null,
              pack_size_kg:   i.pack_size_kg   ?? null,
              total_kg:       i.total_kg       ?? null,
              notes:          i.notes          || null,
            }))
          )

        if (itemsError) throw itemsError
      }
    }

    return NextResponse.json({ data: stockTake })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient()
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabase.from('stock_takes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}