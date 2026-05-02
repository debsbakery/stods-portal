// app/api/standing-orders/generate/route.ts
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// ── Service client (bypasses RLS) ─────────────────────────────────
function createServiceClient() {
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

export async function POST(request: Request) {
  try {
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}))
    const skipDays: string[] = (body.skip_days ?? []).map((d: string) => d.toLowerCase())

    // 🆕 Use Australia time so server (UTC) doesn't get the wrong day
    const ausNow = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' })
    );
    const todayStr = ausNow.toISOString().split('T')[0];

    console.log(`[${new Date().toISOString()}] Starting standing order generation...`);
    console.log(`Today (Brisbane): ${todayStr}`);
    console.log(`Generating orders for the upcoming Sun-Sat week`);

    // ── Fetch all active standing orders ─────────────────────────
    const { data: standingOrders, error: fetchError } = await supabase
      .from('standing_orders')
      .select(`
        *,
        customer:customers(*),
        items:standing_order_items(
          *,
          product:products(*)
        )
      `)
      .eq('active', true);

    if (fetchError) throw fetchError;

    if (!standingOrders || standingOrders.length === 0) {
      console.log('No active standing orders found');
      return NextResponse.json({
        message: 'No active standing orders',
        ordersCreated: 0
      });
    }

    console.log(`Found ${standingOrders.length} active standing orders`);

    let ordersCreated = 0;
    const errors: any[] = [];
    const ordersSummary: any[] = [];

    // ── Process each standing order ───────────────────────────────
    for (const standingOrder of standingOrders) {
      try {
        const deliveryDay = (
          standingOrder.delivery_days ||
          standingOrder.delivery_day ||
          ''
        ).toLowerCase();

        if (!deliveryDay) {
          console.warn(`Standing order ${standingOrder.id} has no delivery day set`)
          continue
        }

        // ── Skip public holidays / manually skipped days ─────────
        if (skipDays.includes(deliveryDay)) {
          console.log(`  Skipping ${deliveryDay} — in skip list`)
          continue
        }

        // 🆕 Always target NEXT week (Sun-Sat), regardless of today
        const deliveryDate    = getNextWeekDeliveryDate(deliveryDay);
        const deliveryDateStr = deliveryDate.toISOString().split('T')[0];

        console.log(
          `Processing: ${standingOrder.customer.business_name} -> ` +
          `${deliveryDay} (${deliveryDateStr})`
        );

        // ── Skip if order already exists for this date ───────────
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_id', standingOrder.customer_id)
          .eq('delivery_date', deliveryDateStr)
          .maybeSingle();

        if (existingOrder) {
          console.log(`  Order already exists for ${deliveryDateStr} — skipping`);
          continue;
        }

        // ── Resolve pricing for each item ─────────────────────────
        const itemsWithPricing = await Promise.all(
          standingOrder.items.map(async (item: any) => {
            const { data: pricing } = await supabase
              .from('customer_pricing')
              .select('contract_price')
              .eq('customer_id', standingOrder.customer_id)
              .eq('product_id', item.product_id)
              .lte('effective_from', deliveryDateStr)
              .or(`effective_to.is.null,effective_to.gte.${deliveryDateStr}`)
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle();

            const unitPrice =
              pricing?.contract_price ??
              item.product.price ??
              item.product.unit_price ??
              0;

            const subtotal = unitPrice * item.quantity;

            return {
              product_id:     item.product_id,
              product_name:   item.product.name,
              quantity:       item.quantity,
              unit_price:     unitPrice,
              subtotal,
              gst_applicable: item.product.gst_applicable ?? false,
            };
          })
        );

        // ── Calculate totals ──────────────────────────────────────
        const totalBeforeGST = itemsWithPricing.reduce(
          (sum, item) => sum + item.subtotal, 0
        );
        const gstAmount = itemsWithPricing
          .filter(item => item.gst_applicable)
          .reduce((sum, item) => sum + item.subtotal * 0.1, 0);
        const totalAmount = totalBeforeGST + gstAmount;

        // ── Create order ──────────────────────────────────────────
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id:             standingOrder.customer_id,
            customer_email:          standingOrder.customer.email,
            customer_business_name:  standingOrder.customer.business_name,
            customer_address:        standingOrder.customer.address,
            customer_abn:            standingOrder.customer.abn,
            delivery_date:           deliveryDateStr,
            total_amount:            totalAmount,
            status:                  'pending',
            source:                  'standing_order',
            notes:                   `Auto-generated from ${deliveryDay} standing order`,
          })
          .select()
          .single();

        if (orderError) {
          console.error(`  Error creating order:`, orderError);
          errors.push({
            standing_order_id: standingOrder.id,
            customer:          standingOrder.customer.business_name,
            error:             orderError.message,
          });
          continue;
        }

        console.log(`  Created order ${newOrder.id.slice(0, 8)}`);

        // ── Create order items ────────────────────────────────────
        const orderItems = itemsWithPricing.map(item => ({
          order_id:       newOrder.id,
          product_id:     item.product_id,
          product_name:   item.product_name,
          quantity:       item.quantity,
          unit_price:     item.unit_price,
          subtotal:       item.subtotal,
          gst_applicable: item.gst_applicable,
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsError) {
          console.error(`  Error creating order items:`, itemsError);
          await supabase.from('orders').delete().eq('id', newOrder.id);
          errors.push({
            standing_order_id: standingOrder.id,
            customer:          standingOrder.customer.business_name,
            error:             itemsError.message,
          });
          continue;
        }

        // ── Update standing order tracking dates ──────────────────
        // Next generation date = the week-after-next's same delivery day
        const followingWeekDelivery = new Date(deliveryDate);
        followingWeekDelivery.setDate(deliveryDate.getDate() + 7);
        const nextGenDateStr = followingWeekDelivery.toISOString().split('T')[0];

        await supabase
          .from('standing_orders')
          .update({
            last_generated_date:  todayStr,
            next_generation_date: nextGenDateStr,
          })
          .eq('id', standingOrder.id);

        ordersCreated++;
        ordersSummary.push({
          customer:     standingOrder.customer.business_name,
          deliveryDay:  deliveryDay,
          deliveryDate: deliveryDateStr,
          total:        totalAmount,
          orderId:      newOrder.id.slice(0, 8),
        });

        console.log(
          `  Complete — Delivery: ${deliveryDateStr}, ` +
          `Total: $${totalAmount.toFixed(2)}`
        );

      } catch (error: any) {
        console.error(`  Error processing standing order ${standingOrder.id}:`, error);
        errors.push({
          standing_order_id: standingOrder.id,
          customer:          standingOrder.customer?.business_name ?? 'Unknown',
          error:             error.message,
        });
      }
    }

    console.log(`Generation complete: ${ordersCreated} orders created`);
    if (ordersSummary.length > 0) {
      console.log('Orders Created:');
      ordersSummary.forEach(o => {
        console.log(
          `  - ${o.customer} | ${o.deliveryDay} (${o.deliveryDate}) | ` +
          `$${o.total.toFixed(2)} | ID: ${o.orderId}`
        );
      });
    }

    return NextResponse.json({
      success:       true,
      message:       `Successfully generated ${ordersCreated} standing orders`,
      ordersCreated,
      orders:        ordersSummary,
      errors:        errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error in standing order generation:', error);
    return NextResponse.json(
      { success: false, error: error.message ?? 'Failed to generate standing orders' },
      { status: 500 }
    );
  }
}

// ── Delivery date calculator ──────────────────────────────────────
/**
 * Returns the date for the requested weekday in NEXT week (Sun-Sat).
 * Same result regardless of which day "today" is.
 *
 * Examples (all give same week's Saturday = May 16):
 *  - Sun May 3  → May 16
 *  - Tue May 5  → May 16
 *  - Sat May 9  → May 16
 */
function getNextWeekDeliveryDate(deliveryDay: string): Date {
  const DAYS = [
    'sunday', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday'
  ];

  const targetIndex = DAYS.indexOf(deliveryDay.toLowerCase());

  if (targetIndex === -1) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Brisbane time so we don't get UTC-shifted into wrong day
  const ausNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' })
  );
  const currentIndex = ausNow.getDay();

  // Find NEXT week's Sunday (start of next week)
  // If today is Sunday → next Sunday = 7 days away
  // Otherwise → days remaining until next Sunday
  const daysUntilNextSunday = currentIndex === 0 ? 7 : 7 - currentIndex;

  const result = new Date(ausNow);
  result.setDate(ausNow.getDate() + daysUntilNextSunday + targetIndex);
  return result;
}

// ── Info endpoint ─────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    message:  'Standing Order Generation Endpoint',
    usage:    'POST to trigger standing order generation for the upcoming Sun-Sat week',
    schedule: 'Manual trigger from Standing Orders admin page',
    manual:   'POST /api/standing-orders/generate',
  });
}