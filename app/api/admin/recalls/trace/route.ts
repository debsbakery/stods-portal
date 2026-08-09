export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveProductIdsForIngredient } from '@/lib/recalls/ingredient-trace'

async function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

// GET - preview the products an ingredient flows into
export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const ingredientId = searchParams.get('ingredient_id')

    if (!ingredientId) {
      return NextResponse.json({ error: 'ingredient_id is required' }, { status: 400 })
    }

    const productIds = await resolveProductIdsForIngredient(supabase, ingredientId)

    if (productIds.length === 0) {
      return NextResponse.json({ products: [], count: 0 })
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds)
      .order('name')

    if (error) throw error

    return NextResponse.json({ products: products || [], count: productIds.length })
  } catch (error: any) {
    console.error('Error tracing ingredient:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}