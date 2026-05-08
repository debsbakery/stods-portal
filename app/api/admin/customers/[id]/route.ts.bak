import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const {
      business_name,
      contact_name,
      phone,
      address,
      email,
      email_2,           // ✅ NEW
      statement_email,   // ✅ NEW
      abn,
      delivery_notes,
      status,
      payment_terms,
    } = body

    if (!business_name?.trim())
      return NextResponse.json({ error: 'Business name required' }, { status: 400 })
    if (!contact_name?.trim())
      return NextResponse.json({ error: 'Contact name required' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('customers')
      .update({
        business_name:   business_name.trim(),
        contact_name:    contact_name.trim(),
        email:           email?.trim().toLowerCase() || undefined,
        email_2:         email_2?.trim().toLowerCase()         || null,  // ✅ NEW
        statement_email: statement_email?.trim().toLowerCase() || null,  // ✅ NEW
        phone:           phone?.trim()          || null,
        address:         address?.trim()        || null,
        abn:             abn?.trim()            || null,
        delivery_notes:  delivery_notes?.trim() || null,
        status,
        payment_terms:   Number(payment_terms),
        updated_at:      new Date().toISOString(),
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE — remove customer if they have no orders ───────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerId = params.id

    // Safety check — block if customer has orders
    const { count: orderCount, error: countError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)

    if (countError) {
      return NextResponse.json({ error: 'Failed to check orders' }, { status: 500 })
    }

    if (orderCount && orderCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete — customer has ${orderCount} order${orderCount !== 1 ? 's' : ''}` },
        { status: 400 }
      )
    }

    // Clean up contract pricing first
    await supabaseAdmin
      .from('customer_pricing')
      .delete()
      .eq('customer_id', customerId)

    // Delete customer
    const { error: deleteError } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', customerId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}