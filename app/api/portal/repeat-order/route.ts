import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // ── Auth check ───────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // ── Body parse ───────────────────────────────────────────────────────────
    const { source_order_id, delivery_date } = await request.json()

    if (!source_order_id || !delivery_date) {
      return NextResponse.json(
        { error: 'source_order_id and delivery_date are required' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)) {
      return NextResponse.json(
        { error: 'delivery_date must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // ── Fetch the source order (must belong to this user) ────────────────────
    const { data: sourceOrder, error: srcErr } = await adminClient
      .from('orders')
      .select(`
        id,
        customer_id,
        customer_email,
        customer_business_name,
        customer_address,
        customer_abn,
        order_items (
          product_id,
          product_name,
          quantity,
          unit_price,
          gst_applicable
        )
      `)
      .eq('id', source_order_id)
      .eq('customer_id', user.id)
      .single()

    if (srcErr || !sourceOrder) {
      return NextResponse.json(
        { error: 'Source order not found or access denied' },
        { status: 404 }
      )
    }

    if (!sourceOrder.order_items || sourceOrder.order_items.length === 0) {
      return NextResponse.json(
        { error: 'Source order has no items' },
        { status: 400 }
      )
    }

    // ── Get current pricing for each product (might have changed) ───────────
    const productIds = sourceOrder.order_items.map((i: any) => i.product_id).filter(Boolean)

    const { data: currentProducts } = await adminClient
      .from('products')
      .select('id, name, price, unit_price, gst_applicable, is_available')
      .in('id', productIds)

    const productMap = new Map(
      (currentProducts ?? []).map((p: any) => [p.id, p])
    )

    // ── Get customer contract pricing ────────────────────────────────────────
    const { data: contractPrices } = await adminClient
      .from('customer_pricing')
      .select('product_id, contract_price')
      .eq('customer_id', user.id)

    const contractMap = new Map(
      (contractPrices ?? []).map((cp: any) => [cp.product_id, Number(cp.contract_price)])
    )

    // ── Build order items with CURRENT prices (not stale historical prices) ─
    const skippedItems: string[] = []
    const orderItems = sourceOrder.order_items
      .map((item: any) => {
        const currentProduct = productMap.get(item.product_id)

        // Skip discontinued or unavailable products
        if (!currentProduct || !currentProduct.is_available) {
          skippedItems.push(item.product_name || 'Unknown product')
          return null
        }

        // Use contract price if customer has one, otherwise current standard price
        const unitPrice = contractMap.has(item.product_id)
          ? contractMap.get(item.product_id)!
          : Number(currentProduct.unit_price ?? currentProduct.price ?? item.unit_price)

        const lineSubtotal = unitPrice * item.quantity
        const gstApplicable = currentProduct.gst_applicable ?? item.gst_applicable ?? false
        const gst = gstApplicable ? lineSubtotal * 0.1 : 0

        return {
          product_id:    item.product_id,
          product_name:  currentProduct.name ?? item.product_name,
          quantity:      item.quantity,
          unit_price:    unitPrice,
          subtotal:      lineSubtotal + gst,
          gst_applicable: gstApplicable,
        }
      })
      .filter((i: any): i is NonNullable<typeof i> => i !== null)

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: 'No available products from your last order. Please use the catalog.' },
        { status: 400 }
      )
    }

    // ── Calculate totals ─────────────────────────────────────────────────────
    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0)

    // ── Create the new order ─────────────────────────────────────────────────
    const { data: newOrder, error: orderErr } = await adminClient
      .from('orders')
      .insert({
        customer_id:            user.id,
        customer_email:         sourceOrder.customer_email,
        customer_business_name: sourceOrder.customer_business_name,
        customer_address:       sourceOrder.customer_address,
        customer_abn:           sourceOrder.customer_abn,
        delivery_date,
        total_amount:           totalAmount,
        status:                 'pending',
        source:                 'online',
        notes:                  `Repeat of order ${source_order_id.slice(0, 8)}`,
        copied_from_order_id:   source_order_id,
      })
      .select()
      .single()

    if (orderErr || !newOrder) {
      console.error('Order create error:', orderErr)
      return NextResponse.json(
        { error: orderErr?.message || 'Failed to create order' },
        { status: 500 }
      )
    }

    // ── Insert order items ───────────────────────────────────────────────────
    const itemsToInsert = orderItems.map(item => ({
      ...item,
      order_id: newOrder.id,
    }))

    const { error: itemsErr } = await adminClient
      .from('order_items')
      .insert(itemsToInsert)

    if (itemsErr) {
      console.error('Order items error:', itemsErr)
      // Rollback: delete the order we just created
      await adminClient.from('orders').delete().eq('id', newOrder.id)
      return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    // ── Send confirmation email (non-fatal) ──────────────────────────────────
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
      if (siteUrl) {
        await fetch(`${siteUrl}/api/orders/send-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId:       newOrder.id,
            customerEmail: user.email,
            businessName:  sourceOrder.customer_business_name,
            deliveryDate:  delivery_date,
            total:         totalAmount,
          }),
        })
      }
    } catch (emailErr) {
      console.error('Email send error (non-fatal):', emailErr)
    }

    return NextResponse.json({
      success: true,
      order_id: newOrder.id,
      total_amount: totalAmount,
      item_count: orderItems.length,
      skipped_items: skippedItems,
    })

  } catch (err: any) {
    console.error('Repeat order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}