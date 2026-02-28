export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// GET all standing orders
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const { data: standingOrders, error } = await supabase
      .from('standing_orders')
      .select(`
        *,
        customer:customers(id, business_name, email, contact_name),
        items:standing_order_items(
          id,
          product_id,
          quantity,
          product:products(id, code, name, price)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ standingOrders }, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching standing orders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch standing orders' },
      { status: 500 }
    )
  }
}

// POST - Create new standing order
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()
    const body = await request.json()
    const { customer_id, delivery_days, active = true, notes, items } = body

    // Validate required fields
    if (!customer_id || !delivery_days) {
      return NextResponse.json(
        { error: 'customer_id and delivery_days are required' },
        { status: 400 }
      )
    }

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    if (!validDays.includes(delivery_days.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid delivery_days. Must be monday-sunday' },
        { status: 400 }
      )
    }

    // Check if customer already has a standing order for this day
    const { data: existing } = await supabase
      .from('standing_orders')
      .select('id, delivery_days')
      .eq('customer_id', customer_id)
      .eq('delivery_days', delivery_days.toLowerCase())
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error: `Standing order already exists for ${delivery_days}`,
          existingId: existing.id,
          skipped: true,
        },
        { status: 409 }
      )
    }

    const next_generation_date = calculateNextGenerationDate(delivery_days.toLowerCase())

    // Create standing order
    const { data: standingOrder, error: orderError } = await supabase
      .from('standing_orders')
      .insert({
        customer_id,
        delivery_days: delivery_days.toLowerCase(),
        active,
        notes: notes || null,
        next_generation_date,
        frequency: 'weekly',
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Add items
    if (items && items.length > 0) {
      const orderItems = items.map((item: any) => ({
        standing_order_id: standingOrder.id,
        product_id: item.product_id,
        quantity: item.quantity,
      }))

      const { error: itemsError } = await supabase
        .from('standing_order_items')
        .insert(orderItems)

      if (itemsError) throw itemsError

      // Sync to shadow orders
      const shadowOrderItems = items.map((item: any) => ({
        customer_id,
        product_id: item.product_id,
        default_quantity: item.quantity,
      }))

      await supabase
        .from('shadow_orders')
        .upsert(shadowOrderItems, { onConflict: 'customer_id,product_id' })
    }

    return NextResponse.json(
      { message: 'Standing order created successfully', standingOrder },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating standing order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create standing order' },
      { status: 500 }
    )
  }
}

function calculateNextGenerationDate(deliveryDay: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetDayIndex = days.indexOf(deliveryDay)
  const today = new Date()
  const currentDayIndex = today.getDay()

  let daysUntilDelivery = targetDayIndex - currentDayIndex
  if (daysUntilDelivery <= 0) daysUntilDelivery += 7

  const daysUntilGeneration = daysUntilDelivery - 2
  const generationDate = new Date(today)
  generationDate.setDate(today.getDate() + daysUntilGeneration)

  return generationDate.toISOString().split('T')[0]
}