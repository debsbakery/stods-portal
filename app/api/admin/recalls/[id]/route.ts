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

// GET recall details with affected customers
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params

    // Get recall details
    const { data: recall, error: recallError } = await supabase
      .from('product_recalls')
      .select('*')
      .eq('id', id)
      .single()

    if (recallError) throw recallError

    // Get affected customers with customer details
    const { data: affectedCustomers, error: customersError } = await supabase
      .from('recall_affected_customers')
      .select(`
        *,
        customers (
          id,
          business_name,
          contact_name,
          email,
          email_2,
          phone,
          address
        )
      `)
      .eq('recall_id', id)
      .order('total_affected_value', { ascending: false })

    if (customersError) throw customersError

    return NextResponse.json({
      recall,
      affected_customers: affectedCustomers || [],
    })
  } catch (error: any) {
    console.error('Error fetching recall details:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update recall status or details
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params
    const body = await request.json()

    const updates: any = {}

    if (body.status) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.status === 'resolved' && !body.resolved_at) {
      updates.resolved_at = new Date().toISOString()
    }

    const { data: recall, error } = await supabase
      .from('product_recalls')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ recall })
  } catch (error: any) {
    console.error('Error updating recall:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Cancel recall
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params

    const { error } = await supabase
      .from('product_recalls')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error cancelling recall:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}