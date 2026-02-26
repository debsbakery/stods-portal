import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role to bypass RLS + FK constraints
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_name, contact_name, email, phone, address, abn, delivery_notes } = body

    if (!business_name?.trim()) return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    if (!contact_name?.trim())  return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    if (!email?.trim())         return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    // Check duplicate email
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id, status')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      const msg = existing.status === 'pending'
        ? 'This email is already registered and awaiting approval.'
        : 'This email is already registered. Please contact us if you need help.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    // Create auth user first (no password — invite only)
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email:          email.trim().toLowerCase(),
      email_confirm:  false,
      user_metadata: {
        business_name,
        contact_name,
        role: 'customer',
      },
    })

    if (authError) {
      // If auth user already exists, still allow customer record
      if (!authError.message.includes('already been registered')) {
        console.error('Auth user creation error:', authError.message)
      }
    }

    // Insert customer — id matches auth user if created, otherwise generate
    const customerId = authUser?.user?.id || crypto.randomUUID()

    const { error: insertError } = await supabaseAdmin
      .from('customers')
      .insert({
        id:             customerId,
        business_name:  business_name.trim(),
        contact_name:   contact_name.trim(),
        email:          email.trim().toLowerCase(),
        phone:          phone?.trim()          || null,
        address:        address?.trim()        || null,
        abn:            abn?.trim()            || null,
        delivery_notes: delivery_notes?.trim() || null,
        status:         'pending',
        balance:        0,
        payment_terms:  30,
      })

    if (insertError) {
      console.error('Customer insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}