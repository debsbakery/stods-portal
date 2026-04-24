import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns the most recent non-cancelled order's items for a customer
// Used for "Copy Last Order" button
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const customerId = params.id

  try {
    // ── 1. Find most recent order ───────────────────────────────────────────
    const { data: lastOrder, error: orderError } = await supabase
      .from('orders')
      .select('id, delivery_date, total_amount')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .order('delivery_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (orderError) throw orderError
    if (!lastOrder) {
      return NextResponse.json({ order: null, items: [] })
    }

    // ── 2. Get its items ────────────────────────────────────────────────────
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        product_id,
        quantity,
        unit_price,
        gst_applicable,
        products (
          id,
          product_code,
          name,
          price,
          gst_applicable
        )
      `)
      .eq('order_id', lastOrder.id)

    if (itemsError) throw itemsError

    // ── 3. Get contract pricing ─────────────────────────────────────────────────
const { data: contractPrices } = await supabase
  .from('customer_pricing')
  .select('product_id, contract_price')        // ✅ contract_price not price
  .eq('customer_id', customerId)

const contractMap = new Map(
  (contractPrices ?? []).map(cp => [cp.product_id, cp.contract_price])  // ✅
)

const mappedItems = (items ?? []).map((item: any) => ({
  product_id:    item.product_id,
  product_code:  item.products?.product_code ?? item.products?.code      // ✅ fallback
                   ? String(item.products?.product_code ?? item.products?.code)
                   : null,
  name:          item.products?.name ?? 'Unknown',
  quantity:      item.quantity,
  unit_price:    contractMap.has(item.product_id)
                   ? contractMap.get(item.product_id)!
                   : (item.unit_price ?? item.products?.price ?? item.products?.unit_price ?? 0),
  has_contract:  contractMap.has(item.product_id),
  gst_applicable: item.gst_applicable ?? item.products?.gst_applicable ?? true,
}))

    return NextResponse.json({
      order: {
        id:            lastOrder.id,
        delivery_date: lastOrder.delivery_date,
        total_amount:  lastOrder.total_amount,
      },
      items: mappedItems,
    })

  } catch (err: any) {
    console.error('GET last-order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}