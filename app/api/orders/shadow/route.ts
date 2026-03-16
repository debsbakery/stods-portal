import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { items } = await request.json()

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // ── Get customer — try by ID first then email ─────────────────────────
    const { data: custById } = await supabase
      .from('customers')
      .select('id, business_name, email, address, abn')
      .eq('id', user.id)
      .maybeSingle()

    const { data: customer } = custById
      ? { data: custById }
      : await supabase
          .from('customers')
          .select('id, business_name, email, address, abn')
          .eq('email', user.email)
          .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // ── Get product details ───────────────────────────────────────────────
    const productIds = items.map((item: any) => item.product_id)
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, unit, gst_applicable')
      .in('id', productIds)

    // ── Calculate totals ──────────────────────────────────────────────────
    let subtotal = 0
    let gst      = 0

    const orderItems = items.map((item: any) => {
      const product = products?.find((p) => p.id === item.product_id)
      if (!product) return null

      const itemSubtotal = item.quantity * product.price
      const itemGst      = product.gst_applicable ? itemSubtotal * 0.1 : 0

      subtotal += itemSubtotal
      gst      += itemGst

      return {
        product_id:     product.id,
        product_name:   product.name,
        quantity:       item.quantity,
        unit_price:     product.price,
        subtotal:       itemSubtotal,
        gst_applicable: product.gst_applicable,
      }
    }).filter(Boolean)

    const total = subtotal + gst

    // ── Tomorrow in Brisbane time ─────────────────────────────────────────
    const nowBrisbane = new Date(
      new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
    )
    nowBrisbane.setDate(nowBrisbane.getDate() + 1)
    const deliveryDate = nowBrisbane.toISOString().split('T')[0]

    // ── Create order ──────────────────────────────────────────────────────
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id:            customer.id,
        customer_email:         customer.email,
        customer_business_name: customer.business_name,
        customer_address:       customer.address,
        customer_abn:           customer.abn,
        delivery_date:          deliveryDate,
        status:                 'pending',
        source:                 'online',
        total_amount:           total,
        notes:                  'Ordered from usual items (shadow order)',
      })
      .select()
      .single()

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }

    // ── Create order items ────────────────────────────────────────────────
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(
        orderItems.map((item: any) => ({
          ...item,
          order_id: newOrder.id,
        }))
      )

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, order_id: newOrder.id })

  } catch (error: any) {
    console.error('Shadow order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}