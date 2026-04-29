import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    // ── Get authenticated user ──────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // ── Get most recent non-cancelled order ─────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        delivery_date,
        total_amount,
        status,
        created_at,
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          unit_price,
          subtotal,
          gst_applicable
        )
      `)
      .eq('customer_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (orderError) {
      console.error('Last order fetch error:', orderError)
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }

    if (!order) {
      return NextResponse.json({ order: null })
    }

    return NextResponse.json({ order })

  } catch (err: any) {
    console.error('Last order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}