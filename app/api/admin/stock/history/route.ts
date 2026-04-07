export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const ingredientId = searchParams.get('ingredient_id')

  let query = supabase
    .from('stock_adjustments')
    .select(`
      id, ingredient_id, adjustment_type, quantity, unit,
      reason, reference, adjusted_by, created_at,
      ingredients ( id, name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (ingredientId) {
    query = query.eq('ingredient_id', ingredientId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}