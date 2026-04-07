export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { name, contact_name, phone, email, address, notes } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name:         name.trim(),
      contact_name: contact_name || null,
      phone:        phone        || null,
      email:        email        || null,
      address:      address      || null,
      notes:        notes        || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { id, name, contact_name, phone, email, address, notes, is_active } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updateData: any = { updated_at: new Date().toISOString() }
  if (name         !== undefined) updateData.name         = name.trim()
  if (contact_name !== undefined) updateData.contact_name = contact_name || null
  if (phone        !== undefined) updateData.phone        = phone        || null
  if (email        !== undefined) updateData.email        = email        || null
  if (address      !== undefined) updateData.address      = address      || null
  if (notes        !== undefined) updateData.notes        = notes        || null
  if (is_active    !== undefined) updateData.is_active    = is_active

  const { data, error } = await supabase
    .from('suppliers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Check if supplier is used by any ingredients
  const { count } = await supabase
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .eq('supplier_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} ingredient(s) use this supplier. Deactivate instead.` },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}