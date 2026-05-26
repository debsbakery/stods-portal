export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — list quotes
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const status = req.nextUrl.searchParams.get('status')
    const customerId = req.nextUrl.searchParams.get('customer_id')

    let query = supabase
      .from('quotes')
      .select('id, quote_number, customer_id, customer_name, title, quote_date, valid_until, total, status, sent_at, accepted_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: quotes, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ quotes: quotes || [] })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — create new quote
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await req.json()

    const {
      customer_id,
      title,
      notes,
      terms,
      valid_until,
      items = [],
    } = body

    // Get customer details for snapshot
    let customerName = ''
    let customerEmail = ''
    let customerAddress = ''
    let customerAbn = ''

    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('business_name, contact_name, email, address, abn')
        .eq('id', customer_id)
        .single()

      if (customer) {
        customerName = customer.business_name || customer.contact_name || ''
        customerEmail = customer.email || ''
        customerAddress = customer.address || ''
        customerAbn = customer.abn || ''
      }
    }

    // Get default settings
    const { data: settings } = await supabase
      .from('quote_settings')
      .select('default_validity_days, default_terms')
      .limit(1)
      .single()

    const validityDays = settings?.default_validity_days || 30
    const defaultTerms = settings?.default_terms || ''

    // Calculate validity date
    const quoteDate = new Date()
    const validUntilDate = valid_until || new Date(quoteDate.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unit_price)), 0)
    const gst = Math.round(subtotal * 0.1 * 100) / 100  // 10% GST
    const total = Math.round((subtotal + gst) * 100) / 100

    // Create quote
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .insert({
        customer_id,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_address: customerAddress,
        customer_abn: customerAbn,
        title: title || `Quote for ${customerName}`,
        notes,
        terms: terms || defaultTerms,
        quote_date: quoteDate.toISOString().split('T')[0],
        valid_until: validUntilDate,
        subtotal: Math.round(subtotal * 100) / 100,
        gst,
        total,
        status: 'draft',
      })
      .select()
      .single()

    if (quoteErr) {
      return NextResponse.json({ error: 'Failed to create quote: ' + quoteErr.message }, { status: 500 })
    }

    // Insert items
    if (items.length > 0 && quote) {
      const itemRows = items.map((item: any, index: number) => ({
        quote_id: quote.id,
        product_id: item.product_id || null,
        name: item.name,
        description: item.description || null,
        quantity: Number(item.quantity),
        unit: item.unit || 'each',
        unit_price: Number(item.unit_price),
        line_total: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100,
        sort_order: index,
      }))

      const { error: itemsErr } = await supabase
        .from('quote_items')
        .insert(itemRows)

      if (itemsErr) {
        console.error('Failed to insert quote items:', itemsErr)
      }
    }

    return NextResponse.json({ quote })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}