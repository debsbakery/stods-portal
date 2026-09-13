export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Orders that were never invoiced. Deliberately NOT date-bounded — the whole
// point is to surface orders with implausible dates that fall outside the
// default window on the invoice-status page.
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, customer_id, delivery_date, total_amount, amount_paid, status, invoice_number')
      .eq('status', 'pending')
      .order('delivery_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Pending query failed: ' + error.message }, { status: 500 })
    }
    if (!orders?.length) {
      return NextResponse.json({ invoices: [] })
    }

    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))]
    const customerMap = new Map<string, string>()

    for (let i = 0; i < customerIds.length; i += 200) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, business_name, contact_name')
        .in('id', customerIds.slice(i, i + 200))

      for (const c of (customers || [])) {
        customerMap.set(c.id, c.business_name || c.contact_name || 'Unknown')
      }
    }

    const invoices = orders.map((o: any) => ({
      id:              o.id,
      customer_id:     o.customer_id,
      customer_name:   customerMap.get(o.customer_id) || 'Unknown',
      delivery_date:   o.delivery_date,
      total_amount:    Number(o.total_amount) || 0,
      amount_paid:     0,
      ar_amount:       0,
      ar_amount_paid:  0,
      balance:         0,
      status:          o.status,
      invoice_number:  o.invoice_number,
      payment_status:  'pending' as const,
      allocations:     [],
    }))

    return NextResponse.json({ invoices })
  } catch (err: any) {
    console.error('List pending invoices error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}