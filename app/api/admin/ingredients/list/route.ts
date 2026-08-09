export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

async function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { data: ingredients, error } = await supabase
      .from('ingredients')
      .select('id, name')
      .order('name')

    if (error) throw error

    return NextResponse.json({ ingredients: ingredients || [] })
  } catch (error: any) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}