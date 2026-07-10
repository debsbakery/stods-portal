export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { customerId, amount, description, applyToInvoices } = body

    if (!customerId || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing customerId or amount' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const paymentAmount = parseFloat(amount)

    const { data: customer } = await supabase
      .from('customers')
      .select('balance, business_name, contact_name')
      .eq('id', customerId)
      .single()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      )
    }

    // ── Record the payment in the payments table (single source of truth) ──
    const { error: pmtError } = await supabase.from('payments').insert({
      customer_id: customerId,
      amount: paymentAmount,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      notes: description || 'Payment received',
      allocated_amount: 0,
    })
    if (pmtError) throw pmtError

    // ── Apply payment to invoices via amount_paid ──
    let paidInvoiceIds: string[] = []
    let remainingPayment = paymentAmount

    if (applyToInvoices && Array.isArray(applyToInvoices) && applyToInvoices.length > 0) {
      // MANUAL MODE: apply to selected invoices
      const { data: selected } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .in('id', applyToInvoices)
        .eq('customer_id', customerId)
        .eq('type', 'invoice')

      for (const invoice of selected || []) {
        if (remainingPayment <= 0.005) break
        const outstanding = Number(invoice.amount) - Number(invoice.amount_paid || 0)
        if (outstanding <= 0.005) continue
        const apply = Math.min(remainingPayment, outstanding)
        const newPaid = Math.round((Number(invoice.amount_paid || 0) + apply) * 100) / 100

        await supabase
          .from('ar_transactions')
          .update({
            amount_paid: newPaid,
            paid_date: newPaid >= Number(invoice.amount) - 0.005
              ? new Date().toISOString().split('T')[0]
              : null,
          })
          .eq('id', invoice.id)

        paidInvoiceIds.push(invoice.id)
        remainingPayment = Math.round((remainingPayment - apply) * 100) / 100
      }
    } else {
      // AUTO MODE (FIFO): oldest outstanding invoices first, partials allowed
      const { data: openInvoices } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .eq('customer_id', customerId)
        .eq('type', 'invoice')
        .order('created_at', { ascending: true })

      for (const invoice of openInvoices || []) {
        if (remainingPayment <= 0.005) break
        const outstanding = Number(invoice.amount) - Number(invoice.amount_paid || 0)
        if (outstanding <= 0.005) continue
        const apply = Math.min(remainingPayment, outstanding)
        const newPaid = Math.round((Number(invoice.amount_paid || 0) + apply) * 100) / 100

        await supabase
          .from('ar_transactions')
          .update({
            amount_paid: newPaid,
            paid_date: newPaid >= Number(invoice.amount) - 0.005
              ? new Date().toISOString().split('T')[0]
              : null,
          })
          .eq('id', invoice.id)

        paidInvoiceIds.push(invoice.id)
        remainingPayment = Math.round((remainingPayment - apply) * 100) / 100
      }
    }

    // ── Overpayment → credit note ──
    if (remainingPayment > 0.009) {
      await supabase.from('ar_transactions').insert({
        customer_id: customerId,
        type: 'credit',
        amount: remainingPayment,
        amount_paid: 0,
        description: `Overpayment credit — payment of $${paymentAmount.toFixed(2)} exceeded open invoices by $${remainingPayment.toFixed(2)}`,
      })
    }

    // ── Canonical balance: Σ(invoice outstanding) − Σ(credit unapplied) ──
    const { data: allTx } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', customerId)

    const newBalance = Math.round(
      (allTx ?? []).reduce((sum, tx) => {
        const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
        if (tx.type === 'invoice') return sum + owed
        if (tx.type === 'credit')  return sum - owed
        return sum   // payment rows ignored — payments live in amount_paid
      }, 0) * 100
    ) / 100

    const { error: updateError } = await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customerId)
    if (updateError) throw updateError

    console.log(`✅ Payment of $${paymentAmount.toFixed(2)} recorded for ${customerId}. ${paidInvoiceIds.length} invoices touched. New balance: $${newBalance.toFixed(2)}`)

    return NextResponse.json({
      success: true,
      newBalance,
      paidInvoices: paidInvoiceIds.length,
      paidInvoiceIds,
    })
  } catch (error) {
    console.error('Record payment error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}