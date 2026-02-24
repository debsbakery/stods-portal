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
    // Calculate correct balance from orders
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, amount_paid')
      .eq('customer_id', customerId)

    const calculatedBalance = (orders || []).reduce((sum, order) => {
      return sum + (order.total_amount - (order.amount_paid || 0))
    }, 0)

    // Update customer balance
    const { error } = await supabase
      .from('customers')
      .update({ balance: calculatedBalance })
      .eq('id', customerId)

    if (error) throw error

    return NextResponse.redirect(new URL(`/admin/ar/${customerId}`, request.url))
  } catch (error: any) {
    console.error('Balance sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}