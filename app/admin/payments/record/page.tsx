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

  // ✅ Fetch unpaid weekly invoices and normalise to same shape
  const { data: weeklyInvoices } = await supabase
    .from('weekly_invoices')
    .select('id, customer_id, week_start, week_end, invoice_number, total_amount, amount_paid, status, due_date')
    .neq('status', 'paid')
    .neq('status', 'cancelled')
    .order('week_start', { ascending: false })

  // Normalise weekly invoices to match Invoice shape
  const normalisedWeekly = (weeklyInvoices ?? []).map((wi: any) => ({
    id:             wi.id,
    customer_id:    wi.customer_id,
    invoice_number: wi.invoice_number,
    total_amount:   wi.total_amount,
    amount_paid:    wi.amount_paid ?? 0,
    status:         wi.status,
    delivery_date:  wi.week_end,   // use week_end as the display date
    is_weekly:      true,          // flag so component can label it differently
  }))

  // Merge regular + weekly invoices
  const allInvoices = [...(invoices ?? []), ...normalisedWeekly]

  // ── Fetch unapplied credits from ar_transactions ──
  const { data: credits } = await supabase
    .from('ar_transactions')
    .select('id, customer_id, amount, amount_paid, description, created_at, invoice_id')
    .eq('type', 'credit')
    .eq('amount_paid', 0)
    .order('created_at', { ascending: true })

  const creditInvoiceIds = (credits || []).map((c: any) => c.invoice_id).filter(Boolean)
  let creditInvoiceMap: Record<string, number> = {}

  if (creditInvoiceIds.length > 0) {
    const { data: creditOrders } = await supabase
      .from('orders')
      .select('id, invoice_number')
      .in('id', creditInvoiceIds)

    for (const o of (creditOrders || [])) {
      if (o.invoice_number) creditInvoiceMap[o.id] = o.invoice_number
    }
  }

  const creditsWithNumbers = (credits || []).map((c: any) => ({
    ...c,
    invoice_number: c.invoice_id ? creditInvoiceMap[c.invoice_id] || null : null,
  }))

  return (
    <RecordPaymentWithAllocation
      customers={customers || []}
      invoices={allInvoices}
      credits={creditsWithNumbers}
    />
  )
}