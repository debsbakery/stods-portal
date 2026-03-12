import RecordPaymentWithAllocation from './record-payment-with-allocation';

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export default async function RecordPaymentPage() {
  const supabase = await createServiceClient();

  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, balance')
    .order('business_name');

  // ✅ Now includes invoice_number
  const { data: invoices } = await supabase
    .from('orders')
    .select('id, delivery_date, total_amount, amount_paid, customer_id, invoice_number')
    .order('delivery_date', { ascending: false });

  return (
    <RecordPaymentWithAllocation 
      customers={customers || []} 
      invoices={invoices || []}
    />
  );
}