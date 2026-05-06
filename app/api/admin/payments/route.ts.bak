export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()

    const {
      customer_id,
      amount,             // CASH amount only (can be 0 if using credits)
      payment_date,
      payment_method,
      reference_number,
      notes,
      allocations = [],
    } = body

    const cashAmount = parseFloat(amount) || 0
    const tickedCredits = allocations.filter((a: any) => a.is_credit)

    // ── Validation ────────────────────────────────────────────────────────
    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    if (cashAmount === 0 && tickedCredits.length === 0) {
      return NextResponse.json(
        { error: 'Provide a cash amount or apply at least one credit' },
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

    const invoiceAllocs = allocations.filter((a: any) => !a.is_credit && a.amount > 0)
    const totalAllocatedToInvoices = invoiceAllocs.reduce(
      (sum: number, a: any) => sum + (parseFloat(a.amount) || 0), 0
    )

    // ── Fetch ticked credits' real available amounts from DB ──────────────
    const creditIds = tickedCredits.map((c: any) => c.invoice_id)
    let availableCredits: Array<{ id: string; amount: number; amount_paid: number; remaining: number; created_at: string }> = []

    if (creditIds.length > 0) {
      const { data: creditTxs } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid, created_at')
        .in('id', creditIds)
        .eq('customer_id', customer_id)
        .eq('type', 'credit')

      availableCredits = (creditTxs || [])
        .map(c => {
          const total    = Number(c.amount) || 0
          const consumed = Number(c.amount_paid) || 0
          return {
            id: c.id,
            amount: total,
            amount_paid: consumed,
            remaining: total - consumed,
            created_at: c.created_at,
          }
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    const totalCreditPool = availableCredits.reduce((s, c) => s + c.remaining, 0)
    const totalAvailable  = cashAmount + totalCreditPool

    // ── Sanity: don't allow allocations to exceed available pool ──────────
    if (totalAllocatedToInvoices > totalAvailable + 0.01) {
      return NextResponse.json(
        { error: `Allocated $${totalAllocatedToInvoices.toFixed(2)} exceeds available $${totalAvailable.toFixed(2)}` },
        { status: 400 }
      )
    }

    // ── Determine credit consumption ──────────────────────────────────────
    // Cash applies first to invoices, credits cover the rest
    const cashAppliedToInvoices   = Math.min(Math.max(0, cashAmount), totalAllocatedToInvoices)
    const creditAppliedToInvoices = Math.max(0, totalAllocatedToInvoices - cashAppliedToInvoices)

    // ── Create the payment record (cash only) ─────────────────────────────
    let payment: any = null
    if (cashAmount !== 0) {
      const { data: paymentRow, error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id,
          amount:           cashAmount,
          payment_date:     payment_date || new Date().toISOString().split('T')[0],
          payment_method:   payment_method   || null,
          reference_number: reference_number || null,
          notes:            notes            || null,
          allocated_amount: cashAppliedToInvoices,
        })
        .select()
        .single()

      if (paymentError) throw paymentError
      payment = paymentRow
    }

    // ── Apply allocations to invoices ─────────────────────────────────────
    let cashRemaining = Math.max(0, cashAmount)

    for (const allocation of invoiceAllocs) {
      if (!allocation.invoice_id || !allocation.amount) continue
      const allocAmount = Number(allocation.amount)

      // Cash portion of this allocation
      const cashPart = Math.min(cashRemaining, allocAmount)
      cashRemaining -= cashPart

      // Link cash payment → invoice (only if there was cash)
      if (cashPart > 0 && payment) {
        await supabase.from('invoice_payments').insert({
          invoice_id: allocation.invoice_id,
          payment_id: payment.id,
          amount:     cashPart,
        })
      }

      // Update ar_transactions.amount_paid by the FULL allocation
      const { data: arTx } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .eq('invoice_id', allocation.invoice_id)
        .single()

      if (arTx) {
        const newAmountPaid = Number(arTx.amount_paid || 0) + allocAmount
        const isFullyPaid   = newAmountPaid >= Number(arTx.amount) - 0.005
        const updateData: any = { amount_paid: Math.round(newAmountPaid * 100) / 100 }
        if (isFullyPaid) {
          updateData.paid_date = payment_date || new Date().toISOString().split('T')[0]
        }
        await supabase.from('ar_transactions').update(updateData).eq('id', arTx.id)
      }

      // Update orders.amount_paid by full allocation
      const { data: order } = await supabase
        .from('orders')
        .select('amount_paid')
        .eq('id', allocation.invoice_id)
        .single()

      if (order) {
        await supabase
          .from('orders')
          .update({
            amount_paid: Math.round(((Number(order.amount_paid) || 0) + allocAmount) * 100) / 100,
          })
          .eq('id', allocation.invoice_id)
      }
    }

    // ── Consume credits proportionally (oldest first) ─────────────────────
    let creditToConsume = creditAppliedToInvoices
    for (const credit of availableCredits) {
      if (creditToConsume <= 0.005) break
      const consumeFromThis = Math.min(credit.remaining, creditToConsume)
      if (consumeFromThis > 0) {
        await supabase
          .from('ar_transactions')
          .update({
            amount_paid: Math.round((credit.amount_paid + consumeFromThis) * 100) / 100,
          })
          .eq('id', credit.id)
        creditToConsume -= consumeFromThis
      }
    }

    // ── Overpayment handler (only on cash overpayments) ───────────────────
    const cashUnallocated = Math.max(0, cashAmount - cashAppliedToInvoices)

    if (cashUnallocated > 0.009) {
      await supabase
        .from('ar_transactions')
        .insert({
          customer_id,
          type:        'credit',
          amount:      Math.round(cashUnallocated * 100) / 100,
          amount_paid: 0,
          description: `Overpayment credit — cash payment of $${cashAmount.toFixed(2)} exceeded allocations by $${cashUnallocated.toFixed(2)}`,
          created_at:  new Date().toISOString(),
        })

      console.log(`[PAYMENTS] Overpayment $${cashUnallocated} → credit created for customer ${customer_id}`)
    }

    // ── Recalculate customer balance from scratch ─────────────────────────
    const { data: allTx } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', customer_id)

    const newBalance = (allTx ?? []).reduce((sum, tx) => {
      const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
      if (tx.type === 'invoice') return sum + owed
      if (tx.type === 'credit')  return sum - owed
      return sum
    }, 0)

    await supabase
      .from('customers')
      .update({ balance: Math.round(newBalance * 100) / 100 })
      .eq('id', customer_id)

    const customerName = customer.business_name || customer.contact_name

    return NextResponse.json({
      payment: {
        id:           payment?.id || null,
        customer:     customerName,
        amount:       cashAmount,
        new_balance:  Math.round(newBalance * 100) / 100,
        allocations:  invoiceAllocs.length,
        credit_used:  Math.round(creditAppliedToInvoices * 100) / 100,
        overpayment:  cashUnallocated > 0.009 ? Math.round(cashUnallocated * 100) / 100 : 0,
      },
    })

  } catch (error: any) {
    console.error('Error recording payment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}