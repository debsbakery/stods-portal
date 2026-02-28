export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// GET: Fetch contracts for a customer
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: 'customerId required' },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    const { data: contracts, error } = await supabase
      .from('customer_pricing')
      .select(`
        *,
        product:products(code, name, price)
      `)
      .eq('customer_id', customerId)
      .order('effective_from', { ascending: false })

    if (error) throw error

    const formatted = (contracts || []).map((c: any) => ({
      ...c,
      product_number: c.product?.code || '',
      product_name: c.product?.name || '',
      standard_price: c.product?.price || 0,
    }))

    return NextResponse.json({ success: true, contracts: formatted })
  } catch (error) {
    console.error('GET contracts error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST: Create or update contract price
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, productId, contractPrice, effectiveFrom, effectiveTo } = body

    if (!customerId || !productId || !contractPrice || !effectiveFrom) {
      return NextResponse.json(
        { success: false, error: 'customerId, productId, contractPrice and effectiveFrom are required' },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Check if contract already exists for this customer/product/date
    const { data: existing } = await supabase
      .from('customer_pricing')
      .select('id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .eq('effective_from', effectiveFrom)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabase
        .from('customer_pricing')
        .update({
          contract_price: contractPrice,
          effective_to: effectiveTo || null,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, data, updated: true })
    } else {
      const { data, error } = await supabase
        .from('customer_pricing')
        .insert({
          customer_id: customerId,
          product_id: productId,
          contract_price: contractPrice,
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, data, updated: false })
    }
  } catch (error) {
    console.error('POST contract error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE: Remove a contract price
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('id')

    if (!contractId) {
      return NextResponse.json(
        { success: false, error: 'Contract ID required' },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    const { error } = await supabase
      .from('customer_pricing')
      .delete()
      .eq('id', contractId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE contract error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}