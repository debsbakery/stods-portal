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

// PUT - Update product (PARTIAL update — only updates fields present in body)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceClient()
    const body = await request.json()

    // Validation: if these fields are present, they must be valid
    if ('name' in body && !body.name) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }
    if ('price' in body && (body.price === undefined || body.price === null)) {
      return NextResponse.json({ error: 'price cannot be null' }, { status: 400 })
    }

    // 🆕 Build update object — ONLY include fields that are explicitly in body
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      'name', 'price', 'description', 'category', 'image_url', 'code',
      'weight_grams', 'labour_pct', 'gst_applicable',
      'production_type', 'pieces_per_tray', 'dough_weight_grams',
    ]

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    // If only updated_at is present, no actual changes — fetch and return
    if (Object.keys(updates).length === 1) {
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
      return NextResponse.json({ product })
    }

    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    console.log(
      'Product updated:',
      product.name,
      'fields:',
      Object.keys(updates).filter(k => k !== 'updated_at').join(',')
    )

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