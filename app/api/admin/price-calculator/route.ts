import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('price_margin_calculator')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('GET price-calculator error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data })
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { rows } = await req.json()

  // Delete all existing rows
  const { error: deleteError } = await supabase
    .from('price_margin_calculator')
    .delete()
    .gte('sort_order', 0)

  if (deleteError) {
    console.error('DELETE price-calculator error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  if (rows && rows.length > 0) {
    const toInsert = rows.map((row: any, idx: number) => ({
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
      console.error('INSERT price-calculator error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}