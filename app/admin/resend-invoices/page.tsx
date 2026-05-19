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

  const today     = new Date()
  const defaultEnd   = today.toISOString().split('T')[0]
  const defaultStartDate = new Date(today)
  defaultStartDate.setDate(defaultStartDate.getDate() - 30)
  const defaultStart = defaultStartDate.toISOString().split('T')[0]

  const startDate  = sp.start_date || defaultStart
  const endDate    = sp.end_date   || defaultEnd
  const customerId = sp.customer_id ?? null

  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, email')
    .order('business_name')

  let orders: any[] = []
  if (customerId) {
    // Daily invoices (not part of weekly)
    const { data: dailyOrders } = await supabase
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
      .is('weekly_invoice_id', null)
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate)
      .order('delivery_date')

    // Weekly invoices for this customer in date range
    const { data: weeklyInvoices } = await supabase
      .from('weekly_invoices')
      .select(`
        id,
        invoice_number,
        week_start,
        week_end,
        total_amount,
        status,
        emailed_at,
        customer:customers ( business_name, email )
      `)
      .eq('customer_id', customerId)
      .gte('week_end', startDate)
      .lte('week_start', endDate)
      .order('week_start')

    // Map weekly invoices to a compatible shape
    const weeklyAsOrders = (weeklyInvoices ?? []).map((wi: any) => ({
      id:              wi.id,
      delivery_date:   wi.week_end,
      invoice_number:  wi.invoice_number,
      total_amount:    wi.total_amount,
      status:          'invoiced',
      customers:       wi.customer,
      is_weekly:       true,
      week_start:      wi.week_start,
      week_end:        wi.week_end,
    }))

    // Combine and sort by date
    const combined = [...(dailyOrders ?? []), ...weeklyAsOrders]
    combined.sort((a: any, b: any) => {
      return (a.delivery_date as string).localeCompare(b.delivery_date as string)
    })
    orders = combined
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