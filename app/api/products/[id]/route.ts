export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

// GET single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceClient()

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    return NextResponse.json({ product })
  } catch (error: any) {
    console.error('Error fetching product:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceClient()
    const body = await request.json()

    const {
      name,
      price,
      description,
      category,
      image_url,
      code,
      weight_grams,
      labour_pct,
      gst_applicable,
    } = body

    if (!name || price === undefined || price === null) {
      return NextResponse.json(
        { error: 'name and price are required' },
        { status: 400 }
      )
    }

    const { data: product, error } = await supabase
      .from('products')
      .update({
        name,
        price,
        description:    description    || null,
        category:       category       || null,
        image_url:      image_url      || null,
        code:           code           || null,
        weight_grams:   weight_grams   ?? null,
        labour_pct:     labour_pct     ?? null,
        gst_applicable: gst_applicable ?? false,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    console.log('Product updated:', product.name, `weight:${product.weight_grams}g`)

    return NextResponse.json({ product })
  } catch (error: any) {
    console.error('Error updating product:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update single field (e.g. gst_applicable toggle)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceClient()
    const body = await request.json()

    const { data: product, error } = await supabase
      .from('products')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product })
  } catch (error: any) {
    console.error('Error patching product:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceClient()

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting product:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}