export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveProductIdsForIngredient } from '@/lib/recalls/ingredient-trace'

async function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

// GET all recalls
export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('product_recalls')
      .select('*')
      .order('initiated_at', { ascending: false })
    if (status) {
      query = query.eq('status', status)
    }

    const { data: recalls, error } = await query

    if (error) throw error

    return NextResponse.json({ recalls: recalls || [] })
  } catch (error: any) {
    console.error('Error fetching recalls:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new recall (by product OR by ingredient) and identify affected customers
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const body = await request.json()

    const recall_type = body.recall_type === 'ingredient' ? 'ingredient' : 'product'
    const { reason, severity, date_from, date_to, initiated_by, notes } = body

    if (!reason || !severity || !date_from || !date_to) {
      return NextResponse.json(
        { error: 'reason, severity, date_from, and date_to are required' },
        { status: 400 }
      )
    }

    // Resolve the product ids this recall covers, and build the insert payload
    let productIds: string[] = []
    const insertData: any = {
      reason,
      severity,
      date_from,
      date_to,
      initiated_by,
      notes,
      status: 'initiated',
      recall_type,
    }

    if (recall_type === 'ingredient') {
      const { ingredient_id, ingredient_name } = body
      if (!ingredient_id || !ingredient_name) {
        return NextResponse.json(
          { error: 'ingredient_id and ingredient_name are required for an ingredient recall' },
          { status: 400 }
        )
      }
      productIds = await resolveProductIdsForIngredient(supabase, ingredient_id)
      insertData.ingredient_id = ingredient_id
      insertData.ingredient_name = ingredient_name
      insertData.product_name = ingredient_name // shown on list/detail as the recall subject
      insertData.affected_product_ids = productIds
    } else {
      const { product_id, product_name } = body
      if (!product_id || !product_name) {
        return NextResponse.json(
          { error: 'product_id and product_name are required for a product recall' },
          { status: 400 }
        )
      }
      productIds = [product_id]
      insertData.product_id = product_id
      insertData.product_name = product_name
      insertData.affected_product_ids = productIds
    }

    // Create recall record
    const { data: recall, error: recallError } = await supabase
      .from('product_recalls')
      .insert(insertData)
      .select()
      .single()

    if (recallError) throw recallError

    // Query affected orders in the recall window
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        delivery_date,
        total_amount,
        order_items (
          id,
          product_id,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .gte('delivery_date', date_from)
      .lte('delivery_date', date_to)

    if (ordersError) throw ordersError

    const productIdSet = new Set(productIds)

    // Group by customer and calculate affected value
    const affectedMap = new Map<string, { orderIds: string[]; totalValue: number }>()

    for (const order of orders || []) {
      const affectedItems = (order.order_items || []).filter(
        (item: any) => productIdSet.has(item.product_id)
      )

      if (affectedItems.length > 0) {
        const orderValue = affectedItems.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        )

        const existing = affectedMap.get(order.customer_id)
        if (existing) {
          existing.orderIds.push(order.id)
          existing.totalValue += orderValue
        } else {
          affectedMap.set(order.customer_id, {
            orderIds: [order.id],
            totalValue: orderValue,
          })
        }
      }
    }

    // Insert affected customers
    const affectedCustomers = Array.from(affectedMap.entries()).map(([customerId, data]) => ({
      recall_id: recall.id,
      customer_id: customerId,
      order_ids: data.orderIds,
      total_affected_value: Math.round(data.totalValue * 100) / 100,
    }))

    if (affectedCustomers.length > 0) {
      const { error: affectedError } = await supabase
        .from('recall_affected_customers')
        .insert(affectedCustomers)

      if (affectedError) throw affectedError
    }

    return NextResponse.json({
      recall,
      resolved_product_count: productIds.length,
      affected_count: affectedCustomers.length,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating recall:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}