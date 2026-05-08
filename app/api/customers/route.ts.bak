export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ── GET all customers ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { data: customers, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .order('business_name')

    if (error) throw error
    return NextResponse.json({ customers: customers || [] })
  } catch (error: any) {
    console.error('❌ Error fetching customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST create new customer (admin) ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_name,
      contact_name,
      email,
      email_2,              // ✅ NEW
      statement_email,      // ✅ NEW
      phone,
      address,
      abn,
      delivery_notes,
      status                = 'active',
      payment_terms         = 30,
      allow_duplicate_email = false,
    } = body

    // Validate
    if (!business_name?.trim())
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    if (!contact_name?.trim())
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    if (!email?.trim())
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    // Check duplicate email
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id, business_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing && !allow_duplicate_email) {
      return NextResponse.json(
        {
          error:             `Email already used by "${existing.business_name}"`,
          duplicate_email:   true,
          existing_business: existing.business_name,
        },
        { status: 409 }
      )
    }

    // ✅ Safely try to create auth user
    let customerId: string

    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
        email:         email.trim().toLowerCase(),
        email_confirm: false,
        user_metadata: { business_name, contact_name, role: 'customer' },
      })

      customerId = authUser?.user?.id || crypto.randomUUID()
    } catch {
      customerId = crypto.randomUUID()
    }

    // Insert customer record
    const { error: insertError } = await supabaseAdmin
      .from('customers')
      .insert({
        id:              customerId,
        business_name:   business_name.trim(),
        contact_name:    contact_name.trim(),
        email:           email.trim().toLowerCase(),
        email_2:         email_2?.trim().toLowerCase()         || null,  // ✅ NEW
        statement_email: statement_email?.trim().toLowerCase() || null,  // ✅ NEW
        phone:           phone?.trim()          || null,
        address:         address?.trim()        || null,
        abn:             abn?.trim()            || null,
        delivery_notes:  delivery_notes?.trim() || null,
        status,
        payment_terms:   Number(payment_terms),
        balance:         0,
      })

    if (insertError) {
      console.error('Customer insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: customerId })

  } catch (error: any) {
    console.error('❌ Error creating customer:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}