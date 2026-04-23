export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ResendInvoicesView from './resend-invoices-view'

export default async function ResendInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string; start_date?: string; end_date?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()
  const sp       = await searchParams

  // ── Default to last 30 days if no dates provided ─────────────
  const today     = new Date()
  const defaultEnd   = today.toISOString().split('T')[0]
  const defaultStartDate = new Date(today)
  defaultStartDate.setDate(defaultStartDate.getDate() - 30)
  const defaultStart = defaultStartDate.toISOString().split('T')[0]

  const startDate  = sp.start_date || defaultStart
  const endDate    = sp.end_date   || defaultEnd
  const customerId = sp.customer_id ?? null

  // ── Fetch all customers ───────────────────────────────────
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, email')
    .order('business_name')

  // ── Fetch invoiced orders for selected customer + date range ───
  let orders: any[] = []
  if (customerId) {
    const { data } = await supabase
      .from('orders')
      .select(`
        id,
        delivery_date,
        invoice_number,
        total_amount,
        status,
        customers ( business_name, email )
      `)
      .eq('customer_id', customerId)
      .eq('status', 'invoiced')
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate)
      .order('delivery_date')

    orders = data ?? []
  }

  return (
    <ResendInvoicesView
      customers={customers ?? []}
      orders={orders}
      selectedCustomerId={customerId}
      startDate={startDate}
      endDate={endDate}
    />
  )
}