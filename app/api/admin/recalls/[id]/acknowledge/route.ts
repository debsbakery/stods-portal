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

// PATCH - Update customer remediation status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params
    const body = await request.json()

    const {
      customer_id,
      customer_acknowledged_at,
      product_returned,
      credit_issued,
      credit_amount,
      replacement_issued,
      notes,
    } = body

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const updates: any = {}

    if (customer_acknowledged_at !== undefined) {
      updates.customer_acknowledged_at = customer_acknowledged_at || new Date().toISOString()
    }
    if (product_returned !== undefined) updates.product_returned = product_returned
    if (credit_issued !== undefined) updates.credit_issued = credit_issued
    if (credit_amount !== undefined) updates.credit_amount = credit_amount
    if (replacement_issued !== undefined) updates.replacement_issued = replacement_issued
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await supabase
      .from('recall_affected_customers')
      .update(updates)
      .eq('recall_id', id)
      .eq('customer_id', customer_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ affected_customer: data })
  } catch (error: any) {
    console.error('Error updating acknowledgment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}