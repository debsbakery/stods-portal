import { createAdminClient } from '@/lib/supabase/admin'   // ✅ service role
import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()                      // ✅ not createClient()
  const { id } = await params

  try {
    // ── 1. Fetch customer ────────────────────────────────────────────
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !customer)
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    // ── 2. Approve the customer ──────────────────────────────────────
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        status:        'active',
        approved_at:   new Date().toISOString(),
        portal_access: true,                                // ✅ mark invited
        invite_sent_at: new Date().toISOString(),           // ✅ record invite time
      })
      .eq('id', id)

    if (updateError) throw updateError

    // ── 3. Send portal invite email ──────────────────────────────────
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      customer.email,
      {
        data: {
          customer_id:   id,
          business_name: customer.business_name,
          role:          'customer',
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/portal`,
      }
    )

    if (inviteError) {
      // Already registered is fine — they can still log in
      if (!inviteError.message.includes('already been registered')) {
        console.error('Invite email failed (customer still approved):', inviteError.message)
      }
    }

    // ── 4. Redirect back — hard reload so badge count updates ────────
    return NextResponse.redirect(
      new URL('/admin/customers/pending', request.url),
      { status: 303 }                                       // ✅ 303 forces GET after POST
    )

  } catch (error: any) {
    console.error('Approve error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}