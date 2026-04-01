export const dynamic = 'force-dynamic'

import RecordPaymentWithAllocation from './record-payment-with-allocation'

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

export default async function RecordPaymentPage() {
  const supabase = await createServiceClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, balance')
    .order('business_name')

  const { data: invoices } = await supabase
    .from('unpaid_orders')
    .select('id, delivery_date, total_amount, amount_paid, customer_id, invoice_number, status')
    .order('delivery_date', { ascending: false })

  // ── Fetch unapplied credits from ar_transactions ──
  const { data: credits } = await supabase
    .from('ar_transactions')
    .select('id, customer_id, amount, amount_paid, description, created_at')
    .eq('type', 'credit')
    .eq('amount_paid', 0)
    .order('created_at', { ascending: true })

  return (
    <RecordPaymentWithAllocation
      customers={customers || []}
      invoices={invoices   || []}
      credits={credits     || []}
    />
  )
}