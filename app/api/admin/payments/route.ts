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

    const cashAmount    = parseFloat(amount) || 0
    const isReversal    = cashAmount < 0
    const tickedCredits = allocations.filter((a: any) => a.is_credit)

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

    // ── Reversal: just record the payment row, insert ar_transaction, recalc balance ──
    if (isReversal) {
      const { data: paymentRow, error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id,
          amount:           cashAmount,
          payment_date:     payment_date || new Date().toISOString().split('T')[0],
          payment_method:   payment_method   || null,
          reference_number: reference_number || null,
          notes:            notes            || null,
          allocated_amount: 0,
        })
        .select()
        .single()

      if (paymentError) throw paymentError

      await supabase.from('ar_transactions').insert({
        customer_id,
        type:        'payment',
        amount:      cashAmount,
        paid_date:   payment_date || new Date().toISOString().split('T')[0],
        description: notes || `Payment reversal - ${new Date().toLocaleDateString('en-AU')}`,
      })

      // Recalculate balance
      const { data: allTx } = await supabase
        .from('ar_transactions')
        .select('type, amount, amount_paid')
        .eq('customer_id', customer_id)

      const newBalance = Math.round(
        (allTx ?? []).reduce((sum, tx) => {
          const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
          if (tx.type === 'invoice') return sum + owed
          if (tx.type === 'payment') return sum - Number(tx.amount)
          if (tx.type === 'credit')  return sum - owed
          return sum
        }, 0) * 100
      ) / 100

      await supabase
        .from('customers')
        .update({ balance: newBalance })
        .eq('id', customer_id)

      return NextResponse.json({
        payment: {
          id:          paymentRow.id,
          customer:    customer.business_name || customer.contact_name,
          amount:      cashAmount,
          new_balance: newBalance,
          allocations: 0,
          credit_used: 0,
          overpayment: 0,
        },
      })
    }

    // ── Normal payment flow below ──
    const invoiceAllocs = allocations.filter((a: any) => !a.is_credit && a.amount > 0)
    const totalAllocatedToInvoices = invoiceAllocs.reduce(
      (sum: number, a: any) => sum + (parseFloat(a.amount) || 0), 0
    )

    // Fetch ticked credits
    const creditIds = tickedCredits.map((c: any) => c.invoice_id)
    let availableCredits: Array<{
      id: string; amount: number; amount_paid: number; remaining: number; created_at: string
    }> = []

    if (creditIds.length > 0) {
      const { data: creditTxs } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid, created_at')
        .in('id', creditIds)
        .eq('customer_id', customer_id)
        .eq('type', 'credit')

      availableCredits = (creditTxs || [])
        .map(c => ({
          id:          c.id,
          amount:      Number(c.amount) || 0,
          amount_paid: Number(c.amount_paid) || 0,
          remaining:   (Number(c.amount) || 0) - (Number(c.amount_paid) || 0),
          created_at:  c.created_at,
        }))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    const totalCreditPool = availableCredits.reduce((s, c) => s + c.remaining, 0)
    const totalAvailable  = cashAmount + totalCreditPool

    if (totalAllocatedToInvoices > totalAvailable + 0.01) {
      return NextResponse.json(
        { error: `Allocated $${totalAllocatedToInvoices.toFixed(2)} exceeds available $${totalAvailable.toFixed(2)}` },
        { status: 400 }
      )
    }

    const cashAppliedToInvoices   = Math.min(cashAmount, totalAllocatedToInvoices)
    const creditAppliedToInvoices = Math.max(0, totalAllocatedToInvoices - cashAppliedToInvoices)

    // Create payment record
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

    // Apply allocations to invoices
    let cashRemaining = cashAmount

    for (const allocation of invoiceAllocs) {
      if (!allocation.invoice_id || !allocation.amount) continue
      const allocAmount    = Number(allocation.amount)
      const isAcceptedFull = allocation.accept_as_full === true
      const shortAmount    = Number(allocation.short_amount || 0)
      const isWeekly       = allocation.is_weekly === true

      const cashPart = Math.min(cashRemaining, allocAmount)
      cashRemaining -= cashPart

      if (cashPart > 0 && payment) {
        await supabase.from('invoice_payments').insert({
          invoice_id: allocation.invoice_id,
          payment_id: payment.id,
          amount:     cashPart,
        })
      }

      if (isWeekly) {
        const { data: wi } = await supabase
          .from('weekly_invoices')
          .select('id, amount_paid, total_amount')
          .eq('id', allocation.invoice_id)
          .single()

        if (wi) {
          let newAmountPaid = Math.round(((Number(wi.amount_paid) || 0) + allocAmount) * 100) / 100
          const wiTotal     = Number(wi.total_amount) || 0
          if (isAcceptedFull) newAmountPaid = wiTotal
          const isFullyPaid = newAmountPaid >= wiTotal - 0.01
          await supabase
            .from('weekly_invoices')
            .update({
              amount_paid: newAmountPaid,
              status:      isFullyPaid ? 'paid' : 'partial',
            })
            .eq('id', allocation.invoice_id)

          const { data: arTx } = await supabase
            .from('ar_transactions')
            .select('id, amount, amount_paid')
            .eq('invoice_id', allocation.invoice_id)
            .maybeSingle()

          if (arTx) {
            let newArPaid = Number(arTx.amount_paid || 0) + allocAmount
            if (isAcceptedFull) newArPaid = Number(arTx.amount)
            await supabase
              .from('ar_transactions')
              .update({ amount_paid: Math.round(newArPaid * 100) / 100 })
              .eq('id', arTx.id)
          }
        }

      } else {
        const { data: arTx } = await supabase
          .from('ar_transactions')
          .select('id, amount, amount_paid')
          .eq('invoice_id', allocation.invoice_id)
          .single()

        if (arTx) {
          let newAmountPaid = Number(arTx.amount_paid || 0) + allocAmount
          const arTotal     = Number(arTx.amount)
          if (isAcceptedFull) newAmountPaid = arTotal
          const isFullyPaid = newAmountPaid >= arTotal - 0.005
          const updateData: any = { amount_paid: Math.round(newAmountPaid * 100) / 100 }
          if (isFullyPaid) {
            updateData.paid_date = payment_date || new Date().toISOString().split('T')[0]
          }
          await supabase.from('ar_transactions').update(updateData).eq('id', arTx.id)
        }

        const { data: order } = await supabase
          .from('orders')
          .select('amount_paid, total_amount')
          .eq('id', allocation.invoice_id)
          .single()

        if (order) {
          let newAmountPaid = Math.round(((Number(order.amount_paid) || 0) + allocAmount) * 100) / 100
          const orderTotal  = Number(order.total_amount) || 0
          if (isAcceptedFull) newAmountPaid = orderTotal
          const isOrderFullyPaid = newAmountPaid >= orderTotal - 0.01
          const orderUpdate: any = { amount_paid: newAmountPaid }
          if (isOrderFullyPaid) orderUpdate.status = 'paid'
          await supabase.from('orders').update(orderUpdate).eq('id', allocation.invoice_id)
        }

        await supabase.from('payment_allocations').insert({
          payment_id:      payment?.id || null,
          order_id:        allocation.invoice_id,
          amount:          allocAmount,
          is_full_payment: isAcceptedFull,
          short_amount:    isAcceptedFull ? shortAmount : 0,
          allocated_by:    null,
        })
      }
    }

    // Consume credits
    let creditToConsume = creditAppliedToInvoices
    for (const credit of availableCredits) {
      if (creditToConsume <= 0.005) break
      const consumeFromThis = Math.min(credit.remaining, creditToConsume)
      if (consumeFromThis > 0) {
        await supabase
          .from('ar_transactions')
          .update({ amount_paid: Math.round((credit.amount_paid + consumeFromThis) * 100) / 100 })
          .eq('id', credit.id)
        creditToConsume -= consumeFromThis
      }
    }

    // Overpayment → credit
    const cashUnallocated = Math.max(0, cashAmount - cashAppliedToInvoices)
    if (cashUnallocated > 0.009) {
      await supabase.from('ar_transactions').insert({
        customer_id,
        type:        'credit',
        amount:      Math.round(cashUnallocated * 100) / 100,
        amount_paid: 0,
        description: `Overpayment credit — cash payment of $${cashAmount.toFixed(2)} exceeded allocations by $${cashUnallocated.toFixed(2)}`,
        created_at:  new Date().toISOString(),
      })
    }

    // FIX: include payment type in balance recalculation
    const { data: allTx } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', customer_id)

    const newBalance = Math.round(
      (allTx ?? []).reduce((sum, tx) => {
        const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
        if (tx.type === 'invoice') return sum + owed
        if (tx.type === 'payment') return sum - Number(tx.amount)
        if (tx.type === 'credit')  return sum - owed
        return sum
      }, 0) * 100
    ) / 100

    await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customer_id)

    return NextResponse.json({
      payment: {
        id:          payment?.id || null,
        customer:    customer.business_name || customer.contact_name,
        amount:      cashAmount,
        new_balance: newBalance,
        allocations: invoiceAllocs.length,
        credit_used: Math.round(creditAppliedToInvoices * 100) / 100,
        overpayment: cashUnallocated > 0.009 ? Math.round(cashUnallocated * 100) / 100 : 0,
      },
    })

  } catch (error: any) {
    console.error('Error recording payment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}