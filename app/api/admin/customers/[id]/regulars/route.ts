import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helper: build final regulars list ────────────────────────────────────────
async function buildResultsWithPins(
  customerId: string,
  items: any[]
) {
  // Get pin/hide overrides
  const { data: overrides } = await supabase
    .from('customer_regular_products')
    .select('product_id, pinned, hidden')
    .eq('customer_id', customerId)

  const overrideMap = new Map(
    (overrides ?? []).map((o: any) => [o.product_id, o])
  )

  // ✅ Fixed: use contract_price not price
  const { data: contractPrices } = await supabase
    .from('customer_pricing')
    .select('product_id, contract_price')
    .eq('customer_id', customerId)

  const contractMap = new Map(
    (contractPrices ?? []).map((cp: any) => [cp.product_id, cp.contract_price])
  )

  // Aggregate order count + last qty per product
  const productStats = new Map<string, {
    product_id:     string
    product_code:   string | null
    name:           string | null
    base_price:     number
    gst_applicable: boolean | null
    order_count:    number
    last_qty:       number
    last_date:      string
  }>()

  for (const item of items) {
    const pid = item.product_id
    if (!pid) continue

    if (!productStats.has(pid)) {
      // ✅ Fixed: check both product_code and code columns
      const rawCode = item.products?.product_code
                   ?? item.products?.code
                   ?? null
      const codeStr = rawCode !== null && rawCode !== undefined
                        ? String(rawCode)
                        : null

      productStats.set(pid, {
        product_id:     pid,
        product_code:   codeStr,
        name:           item.products?.name ?? null,
        base_price:     item.products?.price ?? item.products?.unit_price ?? 0,
        gst_applicable: item.products?.gst_applicable ?? null,
        order_count:    0,
        last_qty:       item.quantity ?? 1,
        last_date:      item.delivery_date ?? '',
      })
    }

    const stat = productStats.get(pid)!
    stat.order_count += 1

    if ((item.delivery_date ?? '') >= stat.last_date) {
      stat.last_qty  = item.quantity ?? 1
      stat.last_date = item.delivery_date ?? ''
    }
  }

  const results: any[] = []

  for (const [pid, stat] of productStats.entries()) {
    const override = overrideMap.get(pid)
    if (override?.hidden) continue
    if (stat.order_count < 3 && !override?.pinned) continue

    // ✅ Contract price takes priority over base price
    const unitPrice = contractMap.has(pid)
      ? contractMap.get(pid)!
      : stat.base_price

    results.push({
      product_id:     pid,
      product_code:   stat.product_code,
      name:           stat.name,
      unit_price:     unitPrice,
      has_contract:   contractMap.has(pid),
      gst_applicable: stat.gst_applicable,
      order_count:    stat.order_count,
      last_qty:       stat.last_qty,
      pinned:         override?.pinned ?? false,
      hidden:         false,
    })
  }

  // Pinned products not in recent history
  for (const [pid, override] of overrideMap.entries()) {
    if (!override.pinned || override.hidden) continue
    if (productStats.has(pid)) continue

    const { data: product } = await supabase
      .from('products')
      .select('id, product_code, code, name, price, unit_price, gst_applicable')
      .eq('id', pid)
      .maybeSingle()

    if (!product) continue

    const rawCode = product.product_code ?? product.code ?? null
    const codeStr = rawCode !== null ? String(rawCode) : null
    const basePrice = product.price ?? product.unit_price ?? 0

    results.push({
      product_id:     pid,
      product_code:   codeStr,
      name:           product.name,
      unit_price:     contractMap.has(pid) ? contractMap.get(pid)! : basePrice,
      has_contract:   contractMap.has(pid),
      gst_applicable: product.gst_applicable,
      order_count:    0,
      last_qty:       null,
      pinned:         true,
      hidden:         false,
    })
  }

  results.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.order_count - a.order_count
  })

  return NextResponse.json({ regulars: results })
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const customerId = params.id

  try {
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString().split('T')[0]

    // Step 1: get this customer's order IDs directly
    const { data: customerOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, delivery_date')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .gte('delivery_date', sinceStr)

    if (ordersError) throw ordersError

    if (!customerOrders || customerOrders.length === 0) {
      return await buildResultsWithPins(customerId, [])
    }

    const orderIds    = customerOrders.map(o => o.id)
    const dateByOrder = new Map(
      customerOrders.map(o => [o.id, o.delivery_date])
    )

    // Step 2: get line items for those orders
    // ✅ Also fetch code + unit_price as fallbacks
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        product_id,
        quantity,
        order_id,
        products (
          id,
          product_code,
          code,
          name,
          price,
          unit_price,
          gst_applicable
        )
      `)
      .in('order_id', orderIds)

    if (itemsError) throw itemsError

    const itemsWithDate = (orderItems ?? []).map((item: any) => ({
      ...item,
      delivery_date: dateByOrder.get(item.order_id) ?? '',
    }))

    return await buildResultsWithPins(customerId, itemsWithDate)

  } catch (err: any) {
    console.error('GET regulars error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const customerId = params.id

  try {
    const { product_id, pinned, hidden } = await request.json()

    if (!product_id) {
      return NextResponse.json({ error: 'product_id required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('customer_regular_products')
      .upsert(
        { customer_id: customerId, product_id, pinned, hidden },
        { onConflict: 'customer_id,product_id' }
      )

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('PATCH regulars error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}