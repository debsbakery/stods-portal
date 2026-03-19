export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ResendInvoicesView from './resend-invoices-view'

export default async function ResendInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string; month?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()
  const sp       = await searchParams
  const month    = sp.month ?? new Date().toISOString().slice(0, 7)
  const customerId = sp.customer_id ?? null

  // ── Fetch all customers ───────────────────────────────────
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, email')
    .order('business_name')

  // ── Fetch invoiced orders for selected customer + month ───
  let orders: any[] = []
  if (customerId) {
    const startDate = month + '-01'
    const endDate   = new Date(month + '-01')
    endDate.setMonth(endDate.getMonth() + 1)
    const endStr = endDate.toISOString().split('T')[0]

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
      .lt('delivery_date', endStr)
      .order('delivery_date')

    orders = data ?? []
  }

  return (
    <ResendInvoicesView
      customers={customers ?? []}
      orders={orders}
      selectedCustomerId={customerId}
      selectedMonth={month}
    />
  )
}