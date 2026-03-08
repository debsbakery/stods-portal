import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customer, deliveryDate, items, totals, metadata } = body

    if (!customer?.id || !deliveryDate || !items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ✅ Insert order
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id:            customer.id,
        customer_email:         customer.email,
        customer_business_name: customer.business_name,
        customer_address:       customer.address || null,
        customer_abn:           customer.abn || null,
        delivery_date:          deliveryDate,
        total_amount:           totals.grandTotal,
        status:                 'pending',
        source:                 metadata.source || 'phone',
        notes:                  metadata.notes || null,
        purchase_order_number:  metadata.purchaseOrderNumber || null,
        docket_number:          metadata.docketNumber || null,
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order insert error:', orderError)
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }

    // ✅ Insert items in one batch
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(
        items.map((item: any) => ({
          order_id:       newOrder.id,
          product_id:     item.productId,
          product_name:   item.productName,
          quantity:       item.quantity,
          unit_price:     item.unitPrice,
          subtotal:       item.quantity * item.unitPrice,
          gst_applicable: item.gstApplicable,
          custom_description: item.custom_description ?? null,
        }))
      )

    if (itemsError) {
      console.error('Items insert error:', itemsError)
      // ✅ Rollback order
      await supabase.from('orders').delete().eq('id', newOrder.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    return NextResponse.json({ order: newOrder }, { status: 201 })

  } catch (err: any) {
    console.error('Create order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}