export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to required' }, { status: 400 })
    }

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, customer_id, delivery_date, total_amount, amount_paid, status, invoice_number')
      .in('status', ['invoiced', 'paid'])
      .not('invoice_number', 'is', null)
      .gt('total_amount', 0)
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .order('delivery_date', { ascending: false })

    if (ordErr) {
      return NextResponse.json({ error: 'Orders query failed: ' + ordErr.message }, { status: 500 })
    }

    if (!orders?.length) {
      return NextResponse.json({ invoices: [] })
    }

    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))]
    const customerMap = new Map<string, string>()
    const chunkSize = 200

    for (let i = 0; i < customerIds.length; i += chunkSize) {
      const chunk = customerIds.slice(i, i + chunkSize)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, business_name, contact_name')
        .in('id', chunk)

      for (const c of (customers || [])) {
        customerMap.set(c.id, c.business_name || c.contact_name || 'Unknown')
      }
    }

    const orderIds = orders.map((o: any) => o.id)
    let allArTx: any[] = []

    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize)
      const { data: arRows } = await supabase
        .from('ar_transactions')
        .select('invoice_id, amount, amount_paid')
        .in('invoice_id', chunk)
        .eq('type', 'invoice')

      if (arRows) allArTx = [...allArTx, ...arRows]
    }

    const arByOrder = new Map<string, any>()
    for (const ar of allArTx) {
      arByOrder.set(ar.invoice_id, ar)
    }

    let allAllocs: any[] = []
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize)
      const { data: allocRows } = await supabase
        .from('payment_allocations')
        .select('id, order_id, payment_id, amount, is_full_payment, short_amount, allocated_at')
        .in('order_id', chunk)
        .is('unallocated_at', null)

      if (allocRows) allAllocs = [...allAllocs, ...allocRows]
    }

    const allocsByOrder = new Map<string, any[]>()
    for (const a of allAllocs) {
      const existing = allocsByOrder.get(a.order_id) || []
      existing.push(a)
      allocsByOrder.set(a.order_id, existing)
    }

    const invoices = orders.map((o: any) => {
      const customerName = customerMap.get(o.customer_id) || 'Unknown'
      const ar = arByOrder.get(o.id)
      const orderAllocs = allocsByOrder.get(o.id) || []

      const totalAmount = Number(o.total_amount) || 0
      const arAmount = ar ? Number(ar.amount) : totalAmount
      const arAmountPaid = ar ? Number(ar.amount_paid || 0) : Number(o.amount_paid || 0)
      const balance = Math.max(0, Math.round((arAmount - arAmountPaid) * 100) / 100)

      let paymentStatus: 'paid' | 'part_paid' | 'unpaid' = 'unpaid'
      if (balance < 0.01) {
        paymentStatus = 'paid'
      } else if (arAmountPaid > 0.01) {
        paymentStatus = 'part_paid'
      }
      if (o.status === 'paid' && paymentStatus === 'unpaid') {
        paymentStatus = 'paid'
      }

      return {
        id: o.id,
        customer_id: o.customer_id,
        customer_name: customerName,
        delivery_date: o.delivery_date,
        total_amount: totalAmount,
        amount_paid: Number(o.amount_paid || 0),
        ar_amount: arAmount,
        ar_amount_paid: arAmountPaid,
        balance,
        status: o.status,
        invoice_number: o.invoice_number,
        payment_status: paymentStatus,
        allocations: orderAllocs,
      }
    })

    return NextResponse.json({ invoices })

  } catch (err: any) {
    console.error('List invoices AR error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}