export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()

    const {
      customer_id,
      amount,
      payment_date,
      payment_method,
      reference_number,
      notes,
      allocations = [],
    } = body

    if (!customer_id || !amount) {
      return NextResponse.json(
        { error: 'customer_id and amount are required' },
        { status: 400 }
      )
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('business_name, contact_name, balance')
      .eq('id', customer_id)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // ── Separate invoice allocations from credit allocations ──────────────
    const invoiceAllocs = allocations.filter((a: any) => !a.is_credit && a.amount > 0)
    const creditAllocs  = allocations.filter((a: any) =>  a.is_credit)

    // ── Record the payment transaction ────────────────────────────────────
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        customer_id,
        amount:           parseFloat(amount),
        payment_date:     payment_date || new Date().toISOString().split('T')[0],
        payment_method:   payment_method   || null,
        reference_number: reference_number || null,
        notes:            notes            || null,
        allocated_amount: invoiceAllocs.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    // ── Process invoice allocations ───────────────────────────────────────
    for (const allocation of invoiceAllocs) {
      if (!allocation.invoice_id || !allocation.amount) continue

      // Link payment → invoice
      await supabase.from('invoice_payments').insert({
        invoice_id: allocation.invoice_id,
        payment_id: payment.id,
        amount:     allocation.amount,
      })

      // Update ar_transactions.amount_paid (invoice_id = orders.id)
      const { data: arTx } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .eq('invoice_id', allocation.invoice_id)
        .single()

      if (arTx) {
        const newAmountPaid = Number(arTx.amount_paid || 0) + Number(allocation.amount)
        const isFullyPaid   = newAmountPaid >= Number(arTx.amount)
        const updateData: any = { amount_paid: newAmountPaid }
        if (isFullyPaid) {
          updateData.paid_date = payment_date || new Date().toISOString().split('T')[0]
        }
        await supabase
          .from('ar_transactions')
          .update(updateData)
          .eq('id', arTx.id)
      }

      // Update orders.amount_paid
      const { data: order } = await supabase
        .from('orders')
        .select('amount_paid')
        .eq('id', allocation.invoice_id)
        .single()

      if (order) {
        await supabase
          .from('orders')
          .update({
            amount_paid: (Number(order.amount_paid) || 0) + Number(allocation.amount),
          })
          .eq('id', allocation.invoice_id)
      }
    }

    // ── Process credit allocations ────────────────────────────────────────
    // Mark each credit as applied (amount_paid = amount = fully used)
    for (const creditAlloc of creditAllocs) {
      if (!creditAlloc.invoice_id) continue  // invoice_id here is actually the credit's ar_transaction id

      const { data: creditTx } = await supabase
        .from('ar_transactions')
        .select('id, amount, type')
        .eq('id', creditAlloc.invoice_id)
        .eq('type', 'credit')
        .eq('customer_id', customer_id)
        .single()

      if (creditTx) {
        await supabase
          .from('ar_transactions')
          .update({ amount_paid: creditTx.amount })
          .eq('id', creditTx.id)
      }
    }

    // ── Recalculate customer balance from scratch ─────────────────────────
    const { data: allTx } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', customer_id)

    const newBalance = (allTx ?? []).reduce((sum, tx) => {
      if (tx.type === 'invoice') {
        return sum + (Number(tx.amount) - Number(tx.amount_paid || 0))
      } else if (tx.type === 'credit') {
        return sum - (Number(tx.amount) - Number(tx.amount_paid || 0))
      }
      return sum
    }, 0)

    await supabase
      .from('customers')
      .update({ balance: Math.round(newBalance * 100) / 100 })
      .eq('id', customer_id)

    const customerName = customer.business_name || customer.contact_name

    return NextResponse.json({
      payment: {
        id:            payment.id,
        customer:      customerName,
        amount:        parseFloat(amount),
        new_balance:   Math.round(newBalance * 100) / 100,
        allocations:   invoiceAllocs.length,
        credits_used:  creditAllocs.length,
      },
    })

  } catch (error: any) {
    console.error('Error recording payment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}