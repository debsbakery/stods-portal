import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import CustomerPortalView from "./portal-view";
import Link from "next/link";

export default async function CustomerPortalPage() {
  const cookieStore = await cookies();
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  // ═══ 1. Get customer record ══════════════════════════════════════════════
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .single();

  if (customerError || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#CE1126" }}>
            Customer Account Not Found
          </h2>
          <p className="text-gray-600 mb-2">
            No customer account linked to: <strong>{user.email}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-4">User ID: {user.id}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/login" className="px-6 py-2 border rounded-md hover:bg-gray-50">
              Try Different Account
            </Link>
            <Link href="/" className="px-6 py-2 text-white rounded-md" style={{ backgroundColor: "#006A4E" }}>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!customer.portal_access) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#CE1126" }}>
            Portal Access Disabled
          </h2>
          <p className="text-gray-600 mb-4">
            Portal access for <strong>{customer.business_name}</strong> is currently disabled.
          </p>
          <Link href="/" className="inline-block px-6 py-2 text-white rounded-md" style={{ backgroundColor: "#006A4E" }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // ═══ 1b. Auto-populate "My Usual Items" if first-time user ═══════════════
  // Run silently in background — does nothing if already initialized
  if (!customer.shadow_orders_initialized) {
    try {
      // Inline the logic to avoid HTTP self-call
      const adminCheck = await supabase
        .from('shadow_orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customer.id)

      if ((adminCheck.count ?? 0) === 0) {
        // Find frequently-ordered products in last 60 days
        const since = new Date()
        since.setDate(since.getDate() - 60)
        const sinceStr = since.toISOString().split('T')[0]

        const { data: histOrders } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_id', customer.id)
          .neq('status', 'cancelled')
          .gte('delivery_date', sinceStr)

        if (histOrders && histOrders.length > 0) {
          const histIds = histOrders.map(o => o.id)

          const { data: histItems } = await supabase
            .from('order_items')
            .select('product_id, quantity')
            .in('order_id', histIds)

          if (histItems && histItems.length > 0) {
            // Aggregate
            const stats = new Map<string, { count: number; totalQty: number }>()
            for (const item of histItems) {
              if (!item.product_id) continue
              const s = stats.get(item.product_id) ?? { count: 0, totalQty: 0 }
              s.count += 1
              s.totalQty += Math.abs(item.quantity ?? 0)
              stats.set(item.product_id, s)
            }

            // Filter to ≥3 times, top 15
            const eligible = Array.from(stats.entries())
              .filter(([_, s]) => s.count >= 3)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 15)

            if (eligible.length > 0) {
              // Verify products are available + not admin
              const pIds = eligible.map(([pid]) => pid)
              const { data: validProds } = await supabase
                .from('products')
                .select('id, is_available, category')
                .in('id', pIds)

              const validSet = new Set(
                (validProds ?? [])
                  .filter(p => p.is_available && p.category !== 'admin')
                  .map(p => p.id)
              )

              const rows = eligible
                .filter(([pid]) => validSet.has(pid))
                .map(([pid, s], idx) => {
                  const avgQty = Math.max(1, Math.round(s.totalQty / s.count))
                  return {
                    customer_id:      customer.id,
                    product_id:       pid,
                    default_quantity: avgQty,
                    quantity:         avgQty,
                    display_order:    idx,
                  }
                })

              if (rows.length > 0) {
                await supabase.from('shadow_orders').insert(rows)
                console.log(`✅ Auto-added ${rows.length} usual items for ${customer.business_name}`)
              }
            }
          }
        }
      }

      // Mark as initialized regardless of whether we added anything
      await supabase
        .from('customers')
        .update({ shadow_orders_initialized: true })
        .eq('id', customer.id)
    } catch (err) {
      console.error('Auto-populate shadow orders failed (non-fatal):', err)
    }
  }
  // ═══ 2. Fetch Standing Orders ════════════════════════════════════════════
  const standingOrders: any[] = [];

  const { data: rawOrders } = await supabase
    .from('standing_orders')
    .select('*')
    .eq('customer_id', customer.id)
    .order('delivery_days', { ascending: true });

  if (rawOrders && rawOrders.length > 0) {
    for (const order of rawOrders) {
      const { data: orderItems } = await supabase
        .from('standing_order_items')
        .select('*')
        .eq('standing_order_id', order.id);

      const enrichedItems: any[] = [];

      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          const { data: product } = await supabase
            .from('products')
            .select('id, name, price, unit_price')
            .eq('id', item.product_id)
            .single();

          if (product) {
            enrichedItems.push({
              id: item.id,
              product_id: item.product_id,
              quantity: item.quantity,
              products: {
                id: product.id,
                name: product.name,
                price: product.price,
                unit_price: product.unit_price || product.price || 0,
              },
            });
          }
        }
      }

      standingOrders.push({
        ...order,
        standing_order_items: enrichedItems,
      });
    }
  }

  // ═══ 3. Fetch Recent Orders (Last 30 Days) ═══════════════════════════════
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentOrdersData } = await supabase
    .from('orders')
    .select(`
      id,
      delivery_date,
      total_amount,
      status,
      created_at,
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        unit_price
      )
    `)
    .eq('customer_id', customer.id)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  const recentOrders = recentOrdersData || [];

  // ═══ 4. Fetch AR Balance ══════════════════════════════════════════════════
  const { data: arData } = await supabase
    .from('customer_ar_summary')
    .select('*')
    .eq('customer_id', customer.id)
    .maybeSingle();

  const arBalance = {
    current:      parseFloat(arData?.current     || '0'),
    days_1_30:    parseFloat(arData?.days_1_30   || '0'),
    days_31_60:   parseFloat(arData?.days_31_60  || '0'),
    days_61_90:   parseFloat(arData?.days_61_90  || '0'),
    days_over_90: parseFloat(arData?.days_over_90 || '0'),
    total_due:    parseFloat(arData?.total_due   || customer.balance || '0'),
  };

  // ═══ 5. Fetch Invoices ════════════════════════════════════════════════════
  const { data: invoiceOrders } = await supabase
    .from('orders')
    .select(`
      id,
      delivery_date,
      total_amount,
      status,
      created_at,
      invoice_numbers (
        invoice_number,
        created_at
      ),
      order_items (
        id,
        product_name,
        quantity,
        unit_price,
        subtotal,
        gst_applicable
      )
    `)
    .eq('customer_id', customer.id)
    .not('invoice_numbers', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const invoices = (invoiceOrders || []).map((o: any) => ({
    id:             o.id,
    delivery_date:  o.delivery_date,
    total_amount:   o.total_amount,
    status:         o.status,
    created_at:     o.created_at,
    invoice_number: o.invoice_numbers?.[0]?.invoice_number ?? null,
    invoice_date:   o.invoice_numbers?.[0]?.created_at ?? o.created_at,
    items:          o.order_items || [],
  }));

  // ═══ 5b. Fetch Last Order for "Repeat Order" feature ══════════════════════
  const { data: lastOrder } = await supabase
    .from('orders')
    .select(`
      id,
      delivery_date,
      total_amount,
      status,
      created_at,
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        unit_price
      )
    `)
    .eq('customer_id', customer.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ═══ 6. Fetch Notifications ═══════════════════════════════════════════════
  const { data: notifications } = await supabase
    .from('customer_notifications')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // ═══ 7. Update Last Login ═════════════════════════════════════════════════
  await supabase
    .from('customers')
    .update({ last_portal_login: new Date().toISOString() })
    .eq('id', customer.id);

  // ═══ 8. Build Portal Data ═════════════════════════════════════════════════
  const portalData = {
    customer: {
      id:            customer.id,
      business_name: customer.business_name || 'Customer',
      contact_name:  customer.contact_name  || '',
      email:         customer.email         || user.email,
      phone:         customer.phone         || '',
      address:       customer.address       || '',
      payment_terms: customer.payment_terms || 30,
      credit_limit:  customer.credit_limit,
      balance:       parseFloat(customer.balance || '0'),
    },
    standingOrders,
    recentOrders,
    arBalance,
    invoices,
    notifications: notifications || [],
    lastOrder:     lastOrder     ?? null,                                    // ✅
    cutoffTime:    customer.cutoff_time ?? customer.default_cutoff_time ?? undefined, // ✅
  };

  return <CustomerPortalView data={portalData} />;
}