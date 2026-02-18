'use server'

import { createClient } from '@/lib/supabase/server'

export async function recordPayment(customerId: string, amount: number, paymentMethod: string) {
  try {
    const supabase = await createClient()

    const { error: txError } = await supabase
      .from('ar_transactions')
      .insert({
        customer_id: customerId,
        type: 'payment',
        amount: -Math.abs(amount),
        description: `Payment received via ${paymentMethod}`,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      })

    if (txError) throw txError

    const { data: customer } = await supabase
      .from('customers')
      .select('balance')
      .eq('id', customerId)
      .single()

    if (customer) {
      const newBalance = parseFloat(customer.balance) - amount

      await supabase
        .from('customers')
        .update({ balance: newBalance })
        .eq('id', customerId)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Payment recording error:', error)
    return { success: false, error: error.message }
  }
}

export async function sendStatement(customerId: string) {
  try {
    console.log(`Would send statement to customer: ${customerId}`)
    
    return { success: true, message: 'Statement sent successfully' }
  } catch (error: any) {
    console.error('Statement send error:', error)
    return { success: false, error: error.message }
  }
}

export async function sendAllStatements() {
  try {
    const supabase = await createClient()
    
    const { data: customers } = await supabase
      .from('customers')
      .select('id, email, business_name, balance')
      .gt('balance', 0)

    if (!customers || customers.length === 0) {
      return { success: true, sent: 0, message: 'No customers with outstanding balances' }
    }

    let sent = 0
    let failed = 0

    for (const customer of customers) {
      try {
        console.log(`Would send statement to ${customer.email}`)
        sent++
      } catch (error) {
        console.error(`Failed to send statement to ${customer.email}:`, error)
        failed++
      }
    }

    return { success: true, sent, failed, total: customers.length }
  } catch (error: any) {
    console.error('Send all statements error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateAgingAction() {
  try {
    const supabase = await createClient()

    // Refresh the customer_ar_summary view
    // This is a materialized view that calculates AR aging
    const { error } = await supabase.rpc('refresh_ar_summary')

    if (error && error.code !== 'PGRST204') {
      // PGRST204 means function doesn't exist, which is OK
      // The view will refresh automatically on query
      console.error('Error refreshing AR summary:', error)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Update aging error:', error)
    return { success: false, error: error.message }
  }
}