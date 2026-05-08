// app/api/admin/weekly-invoices/[id]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: weekly, error: wErr } = await supabase
    .from('weekly_invoices')
    .select(`
      *, customer:customers ( id, business_name, email, address, phone, abn, payment_terms )
    `)
    .eq('id', params.id)
    .single()

  if (wErr || !weekly) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Pull linked orders
  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', params.id)

  const orderIds = (links ?? []).map(l => l.order_id)

  const { data: orders } = await supabase
    .from('orders')
    .select('id, delivery_date, invoice_number, total_amount, status, purchase_order_number')
    .in('id', orderIds)
    .order('delivery_date', { ascending: true })

  return NextResponse.json({ weekly_invoice: weekly, orders: orders ?? [] })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Mark cancelled (soft delete keeps audit trail)
  const { error: uErr } = await supabase
    .from('weekly_invoices')
    .update({ status: 'cancelled' })
    .eq('id', params.id)

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  // Unlink orders so they can be re-batched if needed
  await supabase.from('orders').update({ weekly_invoice_id: null }).eq('weekly_invoice_id', params.id)

  // Reverse the AR transaction
  await supabase
    .from('ar_transactions')
    .delete()
    .eq('description', `weekly:${params.id}`)

  return NextResponse.json({ success: true })
}