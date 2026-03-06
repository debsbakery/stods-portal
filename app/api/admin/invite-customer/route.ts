import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
export async function POST(req: NextRequest) {
  const { customerId } = await req.json()

  if (!customerId) {
    return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
  }


  // Fetch customer — correct column name is business_name not name
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('id, business_name, email, portal_access')
    .eq('id', customerId)
    .single()

  if (fetchError || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  if (!customer.email) {
    return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })
  }

  // Send Supabase invite
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    customer.email,
    {
      data: {
        customer_id: customer.id,
        customer_name: customer.business_name,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/portal`,
    }
  )

  if (inviteError) {
    if (!inviteError.message.includes('already been registered')) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }
  }

  // Mark portal_access = true + record invite time
  await supabase
    .from('customers')
    .update({
      portal_access: true,
      invite_sent_at: new Date().toISOString(),
    })
    .eq('id', customerId)

  return NextResponse.json({ success: true, email: customer.email })
}