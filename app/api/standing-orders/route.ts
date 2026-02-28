export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server';

// ✅ Helper to create service client (bypasses RLS)
async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

// GET all standing orders (admin only)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceClient(); // ✅ Use service client

    const { data: standingOrders, error } = await supabase
      .from('standing_orders')
      .select(`
        *,
        customer:customers(id, business_name, email, contact_name),
        items:standing_order_items(
          id,
          product_id,
          quantity,
          product:products(id, name, price, unit, product_number)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ standingOrders }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Error fetching standing orders:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch standing orders' },
      { status: 500 }
    );
  }
}

// POST - Create new standing order
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient();
    const body = await request.json();
    const { customer_id, delivery_days, active = true, notes, items } = body;

    console.log('📝 Creating standing order:', { customer_id, delivery_day, active, itemCount: items?.length });

    // Validate required fields
    if (!customer_id || !delivery_days) {
      return NextResponse.json(
        { error: 'customer_id and delivery_days are required' },
        { status: 400 }
      );
    }

    // Validate delivery_day
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(delivery_days.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid delivery_days. Must be monday-sunday' },
        { status: 400 }
      );
    }

    // ✅ Check if customer already has a standing order for this day
    const { data: existing } = await supabase
      .from('standing_orders')
      .select('id, delivery_days')
      .eq('customer_id', customer_id)
      .eq('delivery_day', delivery_days.toLowerCase())
      .maybeSingle(); // Use maybeSingle instead of single

    if (existing) {
      console.warn(`⚠️ Standing order already exists for ${delivery_day}`);
      return NextResponse.json(
        { 
          error: `Standing order already exists for ${delivery_day}`,
          existingId: existing.id,
          skipped: true // Flag for frontend to handle gracefully
        },
        { status: 409 }
      );
    }

    // ... rest of the function stays the same

    // Calculate next generation date (2 days before delivery)
    const next_generation_date = calculateNextGenerationDate(delivery_day.toLowerCase());

    console.log('📅 Next generation date:', next_generation_date);

    // Create standing order
    const { data: standingOrder, error: orderError } = await supabase
      .from('standing_orders')
      .insert({
        customer_id,
        delivery_days: delivery_days.toLowerCase(),
        active,
        notes,
        next_generation_date,
        frequency: 'weekly' // Always weekly for daily standing orders
      })
      .select()
      .single();

    if (orderError) {
      console.error('❌ Error creating standing order:', orderError);
      throw orderError;
    }

    console.log('✅ Standing order created:', standingOrder.id);

    // Add items if provided
    if (items && items.length > 0) {
      const orderItems = items.map((item: any) => ({
        standing_order_id: standingOrder.id,
        product_id: item.product_id,
        quantity: item.quantity
      }));

      const { error: itemsError } = await supabase
        .from('standing_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('❌ Error creating items:', itemsError);
        throw itemsError;
      }

      console.log(`✅ Added ${items.length} items to standing order`);

      // Auto-add to shadow orders
      const shadowOrderItems = items.map((item: any) => ({
        customer_id,
        product_id: item.product_id,
        default_quantity: item.quantity
      }));

      // Insert shadow orders (ignore duplicates)
      await supabase
        .from('shadow_orders')
        .upsert(shadowOrderItems, { onConflict: 'customer_id,product_id' });

      console.log('✅ Synced to shadow orders');
    }

    return NextResponse.json(
      { 
        message: 'Standing order created successfully',
        standingOrder 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('❌ Error creating standing order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create standing order' },
      { status: 500 }
    );
  }
}

// Helper function to calculate next generation date
function calculateNextGenerationDate(deliveryDay: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDayIndex = days.indexOf(deliveryDay.toLowerCase());
  
  const today = new Date();
  const currentDayIndex = today.getDay();
  
  let daysUntilDelivery = targetDayIndex - currentDayIndex;
  if (daysUntilDelivery <= 0) {
    daysUntilDelivery += 7; // Next week
  }
  
  // Generation happens 2 days before delivery
  const daysUntilGeneration = daysUntilDelivery - 2;
  
  const generationDate = new Date(today);
  generationDate.setDate(today.getDate() + daysUntilGeneration);
  
  return generationDate.toISOString().split('T')[0];
}
