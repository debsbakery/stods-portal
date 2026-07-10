import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const formData = await request.formData()
  const customerId = formData.get('customer_id') as string

  if (!customerId) {
    return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 })
  }

  try {
    // Canonical balance: Σ(invoice outstanding) − Σ(credit unapplied remainder)
    const { data: allTx, error: txError } = await supabase
      .from('ar_transactions')
      .select('type, amount, amount_paid')
      .eq('customer_id', customerId)

    if (txError) throw txError

    const balance = Math.round(
      (allTx ?? []).reduce((sum, tx) => {
        const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
        if (tx.type === 'invoice') return sum + owed
        if (tx.type === 'credit')  return sum - owed
        return sum
      }, 0) * 100
    ) / 100

    const { error } = await supabase
      .from('customers')
      .update({ balance })
      .eq('id', customerId)

    if (error) throw error

    return NextResponse.redirect(new URL(`/admin/ar/${customerId}`, request.url))
  } catch (error: any) {
    console.error('Balance sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}