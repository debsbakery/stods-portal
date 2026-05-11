// GET /api/admin/search/invoices?q=568
// Searches by invoice_number, customer name, PO number, docket number
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] })
  }

  const isNumber = /^\d+$/.test(q)

  // Build query
  let query = supabase
    .from('orders')
    .select(`
      id,
      invoice_number,
      purchase_order_number,
      docket_number,
      customer_business_name,
      customer_email,
      delivery_date,
      total_amount,
      amount_paid,
      balance_due,
      status,
      weekly_invoice_id
    `)
    .not('invoice_number', 'is', null)
    .order('invoice_number', { ascending: false })
    .limit(20)

  if (isNumber) {
    // Exact invoice number match first
    query = query.eq('invoice_number', parseInt(q))
  } else {
    // Text search — customer name or PO number
    query = query.or(
      `customer_business_name.ilike.%${q}%,` +
      `purchase_order_number.ilike.%${q}%,` +
      `docket_number.ilike.%${q}%,` +
      `customer_email.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) {
    console.error('[invoice search]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data ?? [] })
}