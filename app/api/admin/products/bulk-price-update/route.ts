export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const body = await request.json()
  const { updates } = body as {
    updates: {
      product_id: string
      product_name: string
      old_price: number
      new_price: number
      change_type: string
      change_value: number
    }[]
  }

  if (!updates || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  for (const u of updates) {
    if (u.new_price <= 0) {
      return NextResponse.json(
        { error: `Invalid price for ${u.product_name}: $${u.new_price}` },
        { status: 400 }
      )
    }
  }

  const errors: string[] = []
  let successCount = 0

  for (const u of updates) {
    const { error: updateError } = await supabase
      .from('products')
      .update({ price: u.new_price })
      .eq('id', u.product_id)

    if (updateError) {
      errors.push(`${u.product_name}: ${updateError.message}`)
      continue
    }

    await supabase.from('price_change_log').insert({
      product_id: u.product_id,
      old_price: u.old_price,
      new_price: u.new_price,
      change_type: u.change_type,
      change_value: u.change_value,
      changed_by: null,
    })

    successCount++
  }

  return NextResponse.json({
    success: true,
    updated: successCount,
    errors,
  })
}