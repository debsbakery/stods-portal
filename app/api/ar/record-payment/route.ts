export const dynamic = 'force-dynamic'

// app/api/ar/record-payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'


export async function POST(request: NextRequest) {
  const supabase = await createClient()
  try {
    const { customer_id, amount, description, apply_to_invoice_id } = await request.json()

    if (!customer_id || !amount) {
      return NextResponse.json(
        { error: 'customer_id and amount required' },
        { status: 400 }
      )
    }

    const paymentAmount = parseFloat(amount)
    const isReversal = paymentAmount < 0

    if (paymentAmount === 0) {
      return NextResponse.json(
        { error: 'Payment amount cannot be zero' },
        { status: 400 }
      )
    }

    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('balance, business_name, email')
      .eq('id', customer_id)
      .single()

    if (custError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const currentBalance = parseFloat(customer.balance || '0')
    const newBalance = currentBalance - paymentAmount

    console.log(`💵 Recording ${isReversal ? 'reversal' : 'payment'}:`)
    console.log(`   Customer: ${customer.business_name || customer.email}`)
    console.log(`   Amount: $${paymentAmount.toFixed(2)}`)
    console.log(`   Current balance: $${currentBalance.toFixed(2)}`)
    console.log(`   New balance: $${newBalance.toFixed(2)}`)

    const { data: transaction, error: txError } = await supabase
      .from('ar_transactions')
      .insert({
        customer_id,
        type: 'payment',
        amount: paymentAmount.toFixed(2),
        balance_after: newBalance.toFixed(2),
        paid_date: new Date().toISOString().split('T')[0],
        invoice_id: apply_to_invoice_id || null,
        description: description || (isReversal
          ? `Payment reversal - ${new Date().toLocaleDateString('en-AU')}`
          : `Payment received - ${new Date().toLocaleDateString('en-AU')}`),
      })
      .select()
      .single()

    if (txError) {
      console.error('❌ Transaction insert error:', txError)
      throw txError
    }

    console.log(`   ✅ Transaction recorded: ${transaction.id}`)

    // Variables to track invoice payment status (outside the if block)
    let invoiceFullyPaid = false

    if (apply_to_invoice_id && !isReversal) {
      console.log(`   🔄 Applying payment to invoice: ${apply_to_invoice_id}`)

      const { data: invoiceTx } = await supabase
        .from('ar_transactions')
        .select('id, amount, amount_paid')
        .eq('invoice_id', apply_to_invoice_id)
        .eq('type', 'invoice')
        .maybeSingle()

      if (invoiceTx) {
        const invoiceAmount = parseFloat(invoiceTx.amount)
        const previouslyPaid = parseFloat(invoiceTx.amount_paid || '0')
        const newTotalPaid = previouslyPaid + paymentAmount
        const remainingBalance = invoiceAmount - newTotalPaid

        console.log(`      Invoice amount: $${invoiceAmount.toFixed(2)}`)
        console.log(`      Previously paid: $${previouslyPaid.toFixed(2)}`)
        console.log(`      This payment: $${paymentAmount.toFixed(2)}`)
        console.log(`      Total paid: $${newTotalPaid.toFixed(2)}`)
        console.log(`      Remaining: $${remainingBalance.toFixed(2)}`)

        await supabase
          .from('ar_transactions')
          .update({
            amount_paid: newTotalPaid.toFixed(2),
            paid_date: newTotalPaid >= invoiceAmount ? new Date().toISOString().split('T')[0] : null
          })
          .eq('id', invoiceTx.id)

        if (newTotalPaid >= invoiceAmount) {
          console.log(`      ✅ Invoice FULLY PAID`)
          invoiceFullyPaid = true
        } else {
          console.log(`      🔍 Partial payment: ${((newTotalPaid / invoiceAmount) * 100).toFixed(1)}% paid`)
          invoiceFullyPaid = false
        }
      }
    }

    const { error: balanceError } = await supabase
      .from('customers')
      .update({ balance: newBalance.toFixed(2) })
      .eq('id', customer_id)

    if (balanceError) {
      console.error('❌ Balance update error:', balanceError)
      throw new Error(`Failed to update customer balance: ${balanceError.message}`)
    }

    console.log(`   ✅ Customer balance updated`)

    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ar/aging/update`, {
        method: 'POST',
      })
      console.log(`   ✅ Aging updated`)
    } catch (agingErr) {
      console.warn(`   ⚠️ Aging update error:`, agingErr)
    }

    return NextResponse.json({
      success: true,
      transaction,
      previousBalance: currentBalance,
      newBalance,
      invoiceFullyPaid: apply_to_invoice_id ? invoiceFullyPaid : null,
    })
  } catch (error: any) {
    console.error('❌ Record payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Payment recording failed' },
      { status: 500 }
    )
  }
}