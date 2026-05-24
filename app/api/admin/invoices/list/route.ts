export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'invoiced'

  const supabase = createAdminClient()

  let query = supabase
    .from('orders')
    .select('id, invoice_number, delivery_date, total_amount, status, customer:customers!inner(business_name)')
    .not('status', 'in', '("cancelled","pending","confirmed","in_production","completed")')
    .order('delivery_date', { ascending: false })
    .limit(500)

  if (status === 'invoiced') {
    query = query.eq('status', 'invoiced')
  } else if (status === 'paid') {
    query = query.eq('status', 'paid')
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = (data ?? []).map((o: any) => ({
    ...o,
    customer: Array.isArray(o.customer) ? o.customer[0] : o.customer ?? { business_name: 'Unknown' },
  }))

  return NextResponse.json({ orders })
}
