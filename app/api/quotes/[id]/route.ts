export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET single quote with items
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()
    const { id } = await params

    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order')

    return NextResponse.json({ quote, items: items || [] })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT — update quote
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()
    const { id } = await params
    const body = await req.json()

    const {
      customer_id,
      title,
      notes,
      terms,
      valid_until,
      status,
      items,
    } = body

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (title !== undefined) updateData.title = title
    if (notes !== undefined) updateData.notes = notes
    if (terms !== undefined) updateData.terms = terms
    if (valid_until !== undefined) updateData.valid_until = valid_until

    // Handle status changes
    if (status) {
      updateData.status = status

      if (status === 'sent' && !body.sent_at) {
        updateData.sent_at = new Date().toISOString()
      }
      if (body.sent_at) updateData.sent_at = body.sent_at

      if (status === 'accepted') {
        updateData.accepted_at = new Date().toISOString()

        // ── Write contract prices ──────────────────────────────────
        const { data: existingQuote } = await supabase
          .from('quotes')
          .select('customer_id')
          .eq('id', id)
          .single()

        if (existingQuote?.customer_id) {
          const { data: quoteItems } = await supabase
            .from('quote_items')
            .select('product_id, name, unit_price')
            .eq('quote_id', id)

          if (quoteItems) {
            for (const item of quoteItems) {
              if (!item.product_id) continue

              // Deactivate existing price for this customer+product
              await supabase
                .from('customer_pricing')
                .update({ active: false, updated_at: new Date().toISOString() })
                .eq('customer_id', existingQuote.customer_id)
                .eq('product_id', item.product_id)
                .eq('active', true)

              // Insert new contract price
              await supabase.from('customer_pricing').insert({
                customer_id: existingQuote.customer_id,
                product_id: item.product_id,
                contract_price: item.unit_price,
                source: 'quote',
                source_quote_id: id,
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: null,
                active: true,
              })
            }
          }
        }
      }

      if (status === 'declined') {
        updateData.declined_at = new Date().toISOString()
      }
    }

    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('business_name, contact_name, email, address, abn')
        .eq('id', customer_id)
        .single()

      if (customer) {
        updateData.customer_id = customer_id
        updateData.customer_name = customer.business_name || customer.contact_name || ''
        updateData.customer_email = customer.email || ''
        updateData.customer_address = customer.address || ''
        updateData.customer_abn = customer.abn || ''
      }
    }

    if (items) {
      const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unit_price)), 0)
      const gst = Math.round(subtotal * 0.1 * 100) / 100
      const total = Math.round((subtotal + gst) * 100) / 100

      updateData.subtotal = Math.round(subtotal * 100) / 100
      updateData.gst = gst
      updateData.total = total

      await supabase.from('quote_items').delete().eq('quote_id', id)

      if (items.length > 0) {
        const itemRows = items.map((item: any, index: number) => ({
          quote_id: id,
          product_id: item.product_id || null,
          name: item.name,
          description: item.description || null,
          quantity: Number(item.quantity),
          unit: item.unit || 'each',
          unit_price: Number(item.unit_price),
          line_total: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100,
          sort_order: index,
        }))

        await supabase.from('quote_items').insert(itemRows)
      }
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ quote })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()
    const { id } = await params

    const { data: quote } = await supabase
      .from('quotes')
      .select('status')
      .eq('id', id)
      .single()

    if (quote?.status !== 'draft') {
      return NextResponse.json({ error: 'Can only delete draft quotes' }, { status: 400 })
    }

    await supabase.from('quote_items').delete().eq('quote_id', id)
    await supabase.from('quotes').delete().eq('id', id)

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}