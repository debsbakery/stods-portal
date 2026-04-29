import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const LOOKBACK_DAYS = 60
const MIN_FREQUENCY = 3
const MAX_REGULARS  = 15

export async function POST(_request: NextRequest) {
  try {
    const supabase    = await createClient()
    const adminClient = createAdminClient()

    // ── Auth ────────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // ── Get customer + check if already initialized ─────────────────────────
    const { data: customer, error: custErr } = await adminClient
      .from('customers')
      .select('id, shadow_orders_initialized')
      .eq('id', user.id)
      .maybeSingle()

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (customer.shadow_orders_initialized) {
      return NextResponse.json({
        skipped: true,
        reason:  'Already initialized',
      })
    }

    // ── Check if customer already has shadow items (manual additions) ───────
    const { count: existingCount } = await adminClient
      .from('shadow_orders')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', user.id)

    if ((existingCount ?? 0) > 0) {
      // User already added items manually — mark as initialized and skip
      await adminClient
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', user.id)

      return NextResponse.json({
        skipped: true,
        reason:  'Customer already has shadow items',
      })
    }

    // ── Fetch order history (last 60 days, non-cancelled) ──────────────────
    const since = new Date()
    since.setDate(since.getDate() - LOOKBACK_DAYS)
    const sinceStr = since.toISOString().split('T')[0]

    const { data: customerOrders } = await adminClient
      .from('orders')
      .select('id')
      .eq('customer_id', user.id)
      .neq('status', 'cancelled')
      .gte('delivery_date', sinceStr)

    if (!customerOrders || customerOrders.length === 0) {
      // No order history — mark initialized so we don't keep checking
      await adminClient
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', user.id)

      return NextResponse.json({
        skipped: true,
        reason:  'No order history yet',
      })
    }

    const orderIds = customerOrders.map(o => o.id)

    // ── Get all line items ──────────────────────────────────────────────────
    const { data: orderItems } = await adminClient
      .from('order_items')
      .select('product_id, quantity')
      .in('order_id', orderIds)

    if (!orderItems || orderItems.length === 0) {
      await adminClient
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', user.id)

      return NextResponse.json({
        skipped: true,
        reason:  'No line items in history',
      })
    }

    // ── Aggregate: count orders + sum quantities per product ───────────────
    const productStats = new Map<string, { count: number; totalQty: number }>()

    for (const item of orderItems) {
      if (!item.product_id) continue
      const stat = productStats.get(item.product_id) ?? { count: 0, totalQty: 0 }
      stat.count += 1
      stat.totalQty += Math.abs(item.quantity ?? 0)  // abs handles credit lines
      productStats.set(item.product_id, stat)
    }

    // ── Filter: products ordered ≥ MIN_FREQUENCY times ──────────────────────
    const eligibleProducts = Array.from(productStats.entries())
      .filter(([_, stat]) => stat.count >= MIN_FREQUENCY)
      .sort((a, b) => b[1].count - a[1].count)  // most-frequent first
      .slice(0, MAX_REGULARS)

    if (eligibleProducts.length === 0) {
      await adminClient
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', user.id)

      return NextResponse.json({
        skipped: true,
        reason:  'No products ordered frequently enough',
      })
    }

    // ── Verify products still exist + are available ─────────────────────────
    const productIds = eligibleProducts.map(([pid]) => pid)
    const { data: validProducts } = await adminClient
      .from('products')
      .select('id, is_available, category')
      .in('id', productIds)

    const validIds = new Set(
      (validProducts ?? [])
        .filter(p => p.is_available && p.category !== 'admin')
        .map(p => p.id)
    )

    // ── Build shadow_orders rows ────────────────────────────────────────────
    const rowsToInsert = eligibleProducts
      .filter(([pid]) => validIds.has(pid))
      .map(([pid, stat], idx) => {
        const avgQty = Math.max(1, Math.round(stat.totalQty / stat.count))
        return {
          customer_id:      user.id,
          product_id:       pid,
          default_quantity: avgQty,
          quantity:         avgQty,   // both columns required (NOT NULL)
          display_order:    idx,
        }
      })

    if (rowsToInsert.length === 0) {
      await adminClient
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', user.id)

      return NextResponse.json({
        skipped: true,
        reason:  'No valid products to add',
      })
    }

    // ── Insert + mark initialized ───────────────────────────────────────────
    const { error: insertErr } = await adminClient
      .from('shadow_orders')
      .insert(rowsToInsert)

    if (insertErr) {
      console.error('init-regulars insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    await adminClient
      .from('customers')
      .update({ shadow_orders_initialized: true })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      added:   rowsToInsert.length,
      products: rowsToInsert.map(r => r.product_id),
    })

  } catch (err: any) {
    console.error('init-regulars error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}