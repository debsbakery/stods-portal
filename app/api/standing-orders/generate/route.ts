// app/api/standing-orders/generate/route.ts
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// ── Service client (bypasses RLS) ─────────────────────────────────────────────
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

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    console.log(`[${new Date().toISOString()}] Starting weekly standing order generation...`);
    console.log(`Generating orders for the week of ${todayStr}`);

    // ── Fetch all active standing orders ─────────────────────────────────────
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

    // ── Process each standing order ───────────────────────────────────────────
    for (const standingOrder of standingOrders) {
      try {
        const deliveryDay = (
          standingOrder.delivery_days ||
          standingOrder.delivery_day ||
          ''
        ).toLowerCase();

     // ✅ NEW — add skip check right after
if (!deliveryDay) {
  console.warn(`Standing order ${standingOrder.id} has no delivery day set`)
  continue
}

// ── Skip public holidays / manually skipped days ──────────────────
if (skipDays.includes(deliveryDay)) {
  console.log(`  Skipping ${deliveryDay} — in skip list`)
  continue
}

        const deliveryDate = getNextDeliveryDate(deliveryDay);
        const deliveryDateStr = deliveryDate.toISOString().split('T')[0];

        console.log(
          `Processing: ${standingOrder.customer.business_name} -> ` +
          `${deliveryDay} (${deliveryDateStr})`
        );

        // ── Skip if order already exists for this date ────────────────────────
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

        // ── Resolve pricing for each item ─────────────────────────────────────
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

            // Prefer contract price, then product price
            const unitPrice =
              pricing?.contract_price ??
              item.product.price ??
              item.product.unit_price ??
              0;

            const subtotal = unitPrice * item.quantity;

            return {
              product_id: item.product_id,
              product_name: item.product.name,
              quantity: item.quantity,
              unit_price: unitPrice,
              subtotal,
              gst_applicable: item.product.gst_applicable ?? false,
            };
          })
        );

        // ── Calculate totals ──────────────────────────────────────────────────
        const totalBeforeGST = itemsWithPricing.reduce(
          (sum, item) => sum + item.subtotal, 0
        );
        const gstAmount = itemsWithPricing
          .filter(item => item.gst_applicable)
          .reduce((sum, item) => sum + item.subtotal * 0.1, 0);
        const totalAmount = totalBeforeGST + gstAmount;

        // ── Create order ──────────────────────────────────────────────────────
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
            customer: standingOrder.customer.business_name,
            error: orderError.message,
          });
          continue;
        }

        console.log(`  Created order ${newOrder.id.slice(0, 8)}`);

        // ── Create order items ────────────────────────────────────────────────
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
          // Rollback the parent order
          await supabase.from('orders').delete().eq('id', newOrder.id);
          errors.push({
            standing_order_id: standingOrder.id,
            customer: standingOrder.customer.business_name,
            error: itemsError.message,
          });
          continue;
        }

        // ── Update standing order tracking dates ──────────────────────────────
        const nextDelivery    = getNextDeliveryDate(deliveryDay, 14); // week after next
        const nextGenDateStr  = nextDelivery.toISOString().split('T')[0];

        await supabase
          .from('standing_orders')
          .update({
            last_generated_date: todayStr,
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
          customer: standingOrder.customer?.business_name ?? 'Unknown',
          error: error.message,
        });
      }
    }

    // ── Summary log ───────────────────────────────────────────────────────────
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

// ── Delivery date calculator ──────────────────────────────────────────────────
/**
 * Returns the next occurrence of the given weekday.
 * @param deliveryDay  e.g. "monday", "friday"
 * @param daysAhead    Pass 14 to get the week-after-next occurrence
 */
function getNextDeliveryDate(deliveryDay: string, daysAhead: number = 7): Date {
  const DAYS = [
    'sunday', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday'
  ];

  const targetIndex = DAYS.indexOf(deliveryDay.toLowerCase());

  if (targetIndex === -1) {
    // Unknown day — fallback to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const today        = new Date();
  const currentIndex = today.getDay();
  let daysUntil      = targetIndex - currentIndex;

  if (daysUntil <= 0) daysUntil += 7;          // already passed this week
  if (daysAhead > 7)  daysUntil += 7;          // push to following week

  const result = new Date(today);
  result.setDate(today.getDate() + daysUntil);
  return result;
}

// ── Info endpoint ─────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    message:  'Standing Order Generation Endpoint',
    usage:    'POST to trigger standing order generation',
    schedule: 'Automated: Every Sunday at 6:00 AM',
    manual:   'POST /api/standing-orders/generate',
  });
}