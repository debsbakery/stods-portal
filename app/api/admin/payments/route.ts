export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { customer_id, amount, payment_date, payment_method, reference_number, notes, allocations = [] } = body

    if (!customer_id || !amount) {
      return NextResponse.json({ error: 'customer_id and amount are required' }, { status: 400 })
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('business_name, contact_name, balance')
      .eq('id', customer_id)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        customer_id,
        amount: parseFloat(amount),
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        payment_method: payment_method || null,
        reference_number: reference_number || null,
        notes: notes || null,
        allocated_amount: allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    if (Array.isArray(allocations) && allocations.length > 0) {
      for (const allocation of allocations) {
        if (!allocation.invoice_id || !allocation.amount) continue

        await supabase.from('invoice_payments').insert({
          invoice_id: allocation.invoice_id,
          payment_id: payment.id,
          amount: allocation.amount,
        })

        const { data: arTx } = await supabase
          .from('ar_transactions')
          .select('id, amount, amount_paid')
          .eq('invoice_id', allocation.invoice_id)
          .single()

        if (arTx) {
          const newAmountPaid = Number(arTx.amount_paid || 0) + Number(allocation.amount)
          const isFullyPaid = newAmountPaid >= Number(arTx.amount)
          const updateData: any = { amount_paid: newAmountPaid }
          if (isFullyPaid) {
            updateData.paid_date = payment_date || new Date().toISOString().split('T')[0]
          }
          await supabase.from('ar_transactions').update(updateData).eq('id', arTx.id)
        }

        const { data: invNum } = await supabase
          .from('invoice_numbers')
          .select('order_id')
          .eq('id', allocation.invoice_id)
          .single()

        if (invNum?.order_id) {
          const { data: order } = await supabase
            .from('orders')
            .select('amount_paid')
            .eq('id', invNum.order_id)
            .single()

          await supabase
            .from('orders')
            .update({ amount_paid: (Number(order?.amount_paid) || 0) + Number(allocation.amount) })
            .eq('id', invNum.order_id)
        }
      }
    }

    const newBalance = (Number(customer.balance) || 0) - parseFloat(amount)

    const { error: balanceError } = await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customer_id)

    if (balanceError) {
      console.error('Balance update failed:', balanceError.message)
    }

    const { data: updated } = await supabase
      .from('customers')
      .select('balance')
      .eq('id', customer_id)
      .single()

    const customerName = customer.business_name || customer.contact_name

    return NextResponse.json({
      payment: {
        id: payment.id,
        customer: customerName,
        amount: parseFloat(amount),
        new_balance: updated?.balance ?? 0,
        allocations: allocations.length,
      },
    })

  } catch (error: any) {
    console.error('Error recording payment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
