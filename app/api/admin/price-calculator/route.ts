import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })

  const { data, error } = await supabase
    .from('price_margin_calculator')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data })
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { rows } = await req.json()

  // Delete all existing rows and replace with new ones
  const { error: deleteError } = await supabase
    .from('price_margin_calculator')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  if (rows && rows.length > 0) {
    const toInsert = rows.map((row: any, idx: number) => ({
      id: row.id,
      product: row.product || '',
      cost: parseFloat(row.cost) || 0,
      gst: parseFloat(row.gst) || 0,
      margin_percent: parseFloat(row.marginPercent) || 0,
      sale_price_ex_gst: parseFloat(row.salePriceExGst) || 0,
      sale_price_inc_gst: parseFloat(row.salePriceIncGst) || 0,
      sort_order: idx,
    }))

    const { error: insertError } = await supabase
      .from('price_margin_calculator')
      .insert(toInsert)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}