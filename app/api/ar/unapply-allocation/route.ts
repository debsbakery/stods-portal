export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { allocation_id } = await req.json()

    if (!allocation_id) {
      return NextResponse.json({ error: 'allocation_id required' }, { status: 400 })
    }

    // Get the allocation
    const { data: alloc, error: allocErr } = await supabase
      .from('payment_allocations')
      .select('id, payment_id, order_id, amount, is_full_payment, short_amount, unallocated_at')
      .eq('id', allocation_id)
      .single()

    if (allocErr || !alloc) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    if (alloc.unallocated_at) {
      return NextResponse.json({ error: 'Already unapplied' }, { status: 400 })
    }

    const allocAmount = Number(alloc.amount)
    const shortAmount = Number(alloc.short_amount || 0)

    // ── 1. Soft-delete the allocation ──
    await supabase
      .from('payment_allocations')
      .update({ unallocated_at: new Date().toISOString(), unallocated_by: null })
      .eq('id', allocation_id)

    // ── 2. Reverse orders.amount_paid + status ──
    const { data: order } = await supabase
      .from('orders')
      .select('amount_paid, total_amount, customer_id')
      .eq('id', alloc.order_id)
      .single()

    if (order) {
      const currentPaid = Number(order.amount_paid) || 0
      let newPaid: number

      if (alloc.is_full_payment) {
        newPaid = Math.max(0, Math.round((currentPaid - allocAmount - shortAmount) * 100) / 100)
      } else {
        newPaid = Math.max(0, Math.round((currentPaid - allocAmount) * 100) / 100)
      }

      const orderTotal = Number(order.total_amount) || 0
      const newStatus = newPaid >= orderTotal - 0.01 ? 'paid' : 'invoiced'

      await supabase
        .from('orders')
        .update({ amount_paid: newPaid, status: newStatus })
        .eq('id', alloc.order_id)

      // ── 3. Reverse ar_transactions.amount_paid ──
      const { data: arTx } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .eq('invoice_id', alloc.order_id)
        .eq('type', 'invoice')
        .single()

      if (arTx) {
        const arCurrentPaid = Number(arTx.amount_paid) || 0
        let arNewPaid: number

        if (alloc.is_full_payment) {
          arNewPaid = Math.max(0, Math.round((arCurrentPaid - allocAmount - shortAmount) * 100) / 100)
        } else {
          arNewPaid = Math.max(0, Math.round((arCurrentPaid - allocAmount) * 100) / 100)
        }

        const updateData: any = { amount_paid: arNewPaid }
        if (arNewPaid < Number(arTx.amount) - 0.005) {
          updateData.paid_date = null
        }

        await supabase.from('ar_transactions').update(updateData).eq('id', arTx.id)
      }

      // ── 4. Update payment.allocated_amount ──
      if (alloc.payment_id) {
        const { data: remainingAllocs } = await supabase
          .from('payment_allocations')
          .select('amount')
          .eq('payment_id', alloc.payment_id)
          .is('unallocated_at', null)

        const newAllocTotal = (remainingAllocs || []).reduce(
          (sum: number, a: { amount: number }) => sum + Number(a.amount), 0
        )

        await supabase
          .from('payments')
          .update({ allocated_amount: Math.round(newAllocTotal * 100) / 100 })
          .eq('id', alloc.payment_id)
      }

      // ── 5. Create a credit in ar_transactions for the freed amount ──
      const customerId = order.customer_id
      const creditAmount = alloc.is_full_payment ? allocAmount + shortAmount : allocAmount

      // Get the invoice number for the description
      const { data: orderInfo } = await supabase
        .from('orders')
        .select('invoice_number')
        .eq('id', alloc.order_id)
        .single()

      const invLabel = orderInfo?.invoice_number
        ? `#${String(orderInfo.invoice_number).padStart(6, '0')}`
        : alloc.order_id.slice(0, 8)

      await supabase.from('ar_transactions').insert({
        customer_id: customerId,
        type: 'credit',
        amount: Math.round(creditAmount * 100) / 100,
        amount_paid: 0,
description: `Credit — payment reallocation`,        created_at: new Date().toISOString(),
      })

      // ── 6. Recalculate customer balance ──
      const { data: allTx } = await supabase
        .from('ar_transactions')
        .select('type, amount, amount_paid')
        .eq('customer_id', customerId)

      const newBalance = (allTx ?? []).reduce((sum: number, tx: any) => {
        const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
        if (tx.type === 'invoice') return sum + owed
        if (tx.type === 'credit') return sum - owed
        return sum
      }, 0)

      await supabase
        .from('customers')
        .update({ balance: Math.round(newBalance * 100) / 100 })
        .eq('id', customerId)

      return NextResponse.json({
        success: true,
        unapplied_amount: allocAmount,
        credit_created: Math.round(creditAmount * 100) / 100,
        order_id: alloc.order_id,
        new_order_status: newPaid >= orderTotal - 0.01 ? 'paid' : 'invoiced',
        new_customer_balance: Math.round(newBalance * 100) / 100,
      })
    }

    return NextResponse.json({ success: true, unapplied_amount: allocAmount })

  } catch (err: any) {
    console.error('Unapply allocation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}