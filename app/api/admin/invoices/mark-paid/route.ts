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
  const newStatus = action === 'mark_paid' ? 'paid' : 'invoiced'

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .in('id', order_ids)
    .select('id, customer_id, total_amount, status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customerIds = [...new Set((data ?? []).map((o: any) => o.customer_id))]

  for (const custId of customerIds) {
    const { data: invoiced } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('customer_id', custId)
      .in('status', ['invoiced', 'paid'])

    const { data: paid } = await supabase
      .from('payments')
      .select('amount')
      .eq('customer_id', custId)

    const totalInvoiced = (invoiced ?? []).reduce((s: number, o: any) => s + Number(o.total_amount), 0)
    const totalPaid = (paid ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100

    await supabase.from('customers').update({ balance }).eq('id', custId)
  }

  return NextResponse.json({ success: true, updated: (data ?? []).length, customerIds })
}
