import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { customer_id, credit_id, amount } = await req.json()

  if (!customer_id || !credit_id || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Mark the credit as applied (amount_paid = amount means fully used)
  const { error: creditError } = await supabase
    .from('ar_transactions')
    .update({ amount_paid: amount })
    .eq('id', credit_id)
    .eq('type', 'credit')
    .eq('customer_id', customer_id)

  if (creditError) {
    console.error('Apply credit error:', creditError)
    return NextResponse.json({ error: creditError.message }, { status: 500 })
  }

  // Recalculate customer balance
  const { error: balanceError } = await supabase.rpc('recalculate_customer_balance', {
    p_customer_id: customer_id,
  }).single()

  // If RPC doesn't exist, fall back to manual update
  if (balanceError) {
    const { error: manualError } = await supabase
      .from('customers')
      .update({
        balance: supabase
          .from('ar_transactions')
          .select('COALESCE(SUM(CASE WHEN type = \'invoice\' THEN amount - COALESCE(amount_paid,0) WHEN type = \'credit\' THEN -(amount - COALESCE(amount_paid,0)) ELSE 0 END),0)')
          .eq('customer_id', customer_id)
          .single()
      })
      .eq('id', customer_id)

    if (manualError) {
      // Do it via raw SQL instead
      await supabase.from('customers').update({
        balance: 0 // placeholder — the trigger should handle this
      }).eq('id', customer_id)
    }
  }

  // Recalculate balance directly  
  const { data: txData } = await supabase
    .from('ar_transactions')
    .select('type, amount, amount_paid')
    .eq('customer_id', customer_id)

  if (txData) {
    const newBalance = txData.reduce((sum, tx) => {
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
  }

  return NextResponse.json({ success: true })
}