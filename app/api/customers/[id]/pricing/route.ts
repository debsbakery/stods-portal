// app/api/customers/[id]/pricing/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('customer_pricing')
    .select('product_id, contract_price')
    .eq('customer_id', id)
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .or(`effective_to.is.null,effective_to.gte.${today}`)

  if (error) {
    console.error('Pricing fetch error:', error)
    return NextResponse.json({ pricing: [] })
  }

  const pricing = (data ?? []).map((row) => ({
    product_id: row.product_id,
    price:      row.contract_price ?? 0,
  }))

  console.log('Contract pricing for customer', id, ':', pricing)

  return NextResponse.json({ pricing })
}