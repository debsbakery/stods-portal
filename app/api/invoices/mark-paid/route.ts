export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { order_ids, action } = await request.json()

  if (!order_ids?.length || !['mark_paid', 'mark_unpaid'].includes(action)) {
    return NextResponse.json({ error: 'order_ids and action required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const isPaid = action === 'mark_paid'
  const newStatus = isPaid ? 'paid' : 'invoiced'
  const today = new Date().toISOString().split('T')[0]

  // 1. Flip order status
  const { data: orders, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .in('id', order_ids)
    .select('id, customer_id, total_amount, status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Settle / un-settle the linked AR invoices
  //    mark_paid   → amount_paid = amount, paid_date = today
  //    mark_unpaid → amount_paid = 0,      paid_date = null
  for (const o of orders ?? []) {
    const { data: arTx } = await supabase
      .from('ar_transactions')
      .select('id, amount')
      .eq('invoice_id', o.id)
      .eq('type', 'invoice')
      .maybeSingle()

    if (arTx) {
      await supabase
        .from('ar_transactions')
        .update({
          amount_paid: isPaid ? Number(arTx.amount) : 0,
          paid_date:   isPaid ? today : null,
        })
        .eq('id', arTx.id)
    }
  }

  // 3. Canonical balance recalc per affected customer
  const customerIds = [...new Set((orders ?? []).map((o: any) => o.customer_id))]

  for (const custId of customerIds) {
    const { data: allTx } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', custId)

    const balance = Math.round(
      (allTx ?? []).reduce((sum, tx) => {
        const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
        if (tx.type === 'invoice') return sum + owed
        if (tx.type === 'credit')  return sum - owed
        return sum
      }, 0) * 100
    ) / 100

    await supabase.from('customers').update({ balance }).eq('id', custId)
  }

  return NextResponse.json({ success: true, updated: (orders ?? []).length, customerIds })
}