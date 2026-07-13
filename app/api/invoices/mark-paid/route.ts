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
    return NextResponse.json({ error: 'order_ids and action (mark_paid|mark_unpaid) required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const newStatus = action === 'mark_paid' ? 'paid' : 'invoiced'

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .in('id', order_ids)
    .select('id, customer_id, total_amount, status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate balance for affected customers
  const customerIds = [...new Set(data.map((o: any) => o.customer_id))]

    for (const custId of customerIds) {
    // Canonical: Σ(invoice outstanding) − Σ(credit unapplied). Payments live in amount_paid.
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

  return NextResponse.json({ success: true, updated: data.length, customerIds })
}