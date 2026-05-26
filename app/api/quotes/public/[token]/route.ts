export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — no auth required, uses token
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = createAdminClient()
    const { token } = await params

    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('access_token', token)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: items } = await supabase
      .from('quote_items')
      .select('name, description, quantity, unit, unit_price, line_total, sort_order')
      .eq('quote_id', quote.id)
      .order('sort_order')

    const { data: settings } = await supabase
      .from('quote_settings')
      .select('*')
      .limit(1)
      .single()

    const publicQuote = {
      quote_number: quote.quote_number,
      customer_name: quote.customer_name,
      title: quote.title,
      notes: quote.notes,
      terms: quote.terms,
      quote_date: quote.quote_date,
      valid_until: quote.valid_until,
      subtotal: quote.subtotal,
      gst: quote.gst,
      total: quote.total,
      status: quote.status,
    }

    return NextResponse.json({ quote: publicQuote, items: items || [], company: settings })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — accept or decline
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = createAdminClient()
    const { token } = await params
    const { action } = await req.json()

    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('id, customer_id, status, valid_until')
      .eq('access_token', token)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (quote.status !== 'sent') {
      return NextResponse.json({ error: `Quote is ${quote.status}, cannot ${action}` }, { status: 400 })
    }

    if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
      await supabase.from('quotes').update({ status: 'expired' }).eq('id', quote.id)
      return NextResponse.json({ error: 'Quote has expired' }, { status: 400 })
    }

    const updateData: any = {
      status: action === 'accept' ? 'accepted' : 'declined',
      updated_at: new Date().toISOString(),
    }

    if (action === 'accept') {
      updateData.accepted_at = new Date().toISOString()

      // ── Set contract prices from quote items ──
      const { data: items } = await supabase
        .from('quote_items')
        .select('product_id, name, unit_price')
        .eq('quote_id', quote.id)

      if (items && quote.customer_id) {
        for (const item of items) {
          if (!item.product_id) continue

          // Deactivate existing price for this customer+product
          await supabase
            .from('customer_pricing')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('customer_id', quote.customer_id)
            .eq('product_id', item.product_id)
            .eq('active', true)

          // Insert new contract price
          await supabase.from('customer_pricing').insert({
            customer_id: quote.customer_id,
            product_id: item.product_id,
            contract_price: item.unit_price,
            source: 'quote',
            source_quote_id: quote.id,
            effective_from: new Date().toISOString().split('T')[0],
            effective_to: null,
            active: true,
          })
        }
      }
    } else {
      updateData.declined_at = new Date().toISOString()
    }

    await supabase.from('quotes').update(updateData).eq('id', quote.id)

    return NextResponse.json({ success: true, status: updateData.status })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}