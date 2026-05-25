export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, category, product_code, is_available')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mapped = (products || []).map(p => ({
    ...p,
    active: p.is_available !== false,
  }))

  return NextResponse.json({ products: mapped })
}