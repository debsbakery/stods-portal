import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ShadowOrderView from './shadow-order-view';

export default async function ShadowOrderPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get customer info
  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, contact_name')
    .eq('id', user.id)
    .single();

  if (!customer) {
    redirect('/portal');
  }

  // Get shadow orders with product details
  const { data: shadowOrders, error } = await supabase
    .from('shadow_orders')
    .select(`
      id,
      product_id,
      default_quantity,
      display_order,
      product:products (
        id,
        name,
        product_number,
        price,
        unit,
        category,
        is_available
      )
    `)
    .eq('customer_id', user.id)
    .order('display_order', { ascending: true });

  // If error or no data, pass empty array
  const items = shadowOrders || [];

  console.log('🎯 Shadow orders loaded:', {
    customer: customer.business_name,
    count: items.length,
    error: error?.message,
  });

  return <ShadowOrderView customer={customer} shadowOrders={items} />;
}