import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import CustomerPortalView from "./portal-view";
import Link from "next/link";

export default async function CustomerPortalPage() {
  const cookieStore = await cookies();
  const supabase = await createClient();
  
  // ✅ Use getUser() for better security
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log('🔐 Portal auth check:', {
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email
  });

  if (userError || !user) {
    console.log('❌ No user found - redirecting to login');
    redirect('/login');
  }

  // ═══════════════════════════════════════════
  // 1. Get customer record
  // ═══════════════════════════════════════════
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .single();

  console.log('👤 Customer lookup:', {
    found: !!customer,
    customerId: customer?.id,
    businessName: customer?.business_name
  });

  if (customerError || !customer) {
    console.error('❌ Customer not found:', customerError);
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

  // ═══════════════════════════════════════════
  // 2. Fetch Standing Orders (SHOW ALL - ACTIVE & PAUSED)
  // ═══════════════════════════════════════════

  console.log('🔍 Fetching standing orders for customer:', customer.id);

  const standingOrders: any[] = [];

  // ✅ Fetch ALL standing orders (active and paused)
  const { data: rawOrders } = await supabase
    .from('standing_orders')
    .select('*')
    .eq('customer_id', customer.id)
    .order('delivery_days', { ascending: true });

  console.log('📦 Raw orders:', {
    count: rawOrders?.length || 0,
    sample: rawOrders?.[0]
  });

  if (rawOrders && rawOrders.length > 0) {
    console.log(`✅ Found ${rawOrders.length} standing orders (active + paused)`);

    for (const order of rawOrders) {
      const { data: orderItems } = await supabase
        .from('standing_order_items')
        .select('*')
        .eq('standing_order_id', order.id);

      console.log(`  ${order.delivery_days} (${order.active ? 'active' : 'paused'}): ${orderItems?.length || 0} items`);

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
                unit_price: product.unit_price || product.price || 0
              }
            });
          }
        }
      }

      standingOrders.push({
        ...order,
        standing_order_items: enrichedItems
      });
    }
  }

  console.log('✅ Standing Orders loaded:', {
    count: standingOrders.length,
    active: standingOrders.filter(o => o.active).length,
    paused: standingOrders.filter(o => !o.active).length,
    days: standingOrders.map(o => `${o.delivery_days} (${o.active ? 'active' : 'paused'})`),
    totalItems: standingOrders.reduce((sum, o) => sum + (o.standing_order_items?.length || 0), 0)
  });

  // ═══════════════════════════════════════════
  // 3. Fetch Recent Orders (Last 30 Days)
  // ═══════════════════════════════════════════
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

  // ═══════════════════════════════════════════
  // 4. Fetch AR Balance
  // ═══════════════════════════════════════════
  const { data: arData } = await supabase
    .from('customer_ar_summary')
    .select('*')
    .eq('customer_id', customer.id)
    .maybeSingle();

  const arBalance = {
    current: parseFloat(arData?.current || '0'),
    days_1_30: parseFloat(arData?.days_1_30 || '0'),
    days_31_60: parseFloat(arData?.days_31_60 || '0'),
    days_61_90: parseFloat(arData?.days_61_90 || '0'),
    days_over_90: parseFloat(arData?.days_over_90 || '0'),
    total_due: parseFloat(arData?.total_due || customer.balance || '0'),
  };

 // ═══════════════════════════════════════════
// 5. Fetch Invoices (join invoice_numbers)
// ═══════════════════════════════════════════
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
  // ═══════════════════════════════════════════
  // 6. Fetch Notifications
  // ═══════════════════════════════════════════
  const { data: notifications } = await supabase
    .from('customer_notifications')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // ═══════════════════════════════════════════
  // 7. Update Last Login
  // ═══════════════════════════════════════════
  await supabase
    .from('customers')
    .update({ last_portal_login: new Date().toISOString() })
    .eq('id', customer.id);

  // ═══════════════════════════════════════════
  // 8. Build Portal Data
  // ═══════════════════════════════════════════
  const portalData = {
    customer: {
      id: customer.id,
      business_name: customer.business_name || 'Customer',
      contact_name: customer.contact_name || '',
      email: customer.email || user.email,
      phone: customer.phone || '',
      address: customer.address || '',
      payment_terms: customer.payment_terms || 30,
      credit_limit: customer.credit_limit,
      balance: parseFloat(customer.balance || '0'),
    },
    standingOrders: standingOrders,
    recentOrders: recentOrders,
    arBalance: arBalance,
    invoices: invoices ,
    notifications: notifications || [],
  };

  console.log('✅ Portal data loaded:', {
    customer: portalData.customer.business_name,
    standingOrders: portalData.standingOrders.length,
    activeStandingOrders: portalData.standingOrders.filter((o: any) => o.active).length,
    pausedStandingOrders: portalData.standingOrders.filter((o: any) => !o.active).length,
    recentOrders: portalData.recentOrders.length,
    invoices: portalData.invoices.length
  });

  return <CustomerPortalView data={portalData} />;
}