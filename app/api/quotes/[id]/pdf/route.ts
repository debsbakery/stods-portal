export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateQuotePDF } from '@/lib/pdf/quote'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminClient()
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download') === 'true'

    // Fetch quote
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Fetch items
    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order')
    console.log('Quote items:', JSON.stringify(items, null, 2))
    // Fetch customer
    let customer: any = null
    if (quote.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, business_name, email, address, phone, abn')
        .eq('id', quote.customer_id)
        .single()
      customer = customerData
    }

    // Generate PDF
    const pdf = await generateQuotePDF({
      quote: {
        quote_number:           quote.quote_number,
        created_at:             quote.created_at,
        valid_until:            quote.valid_until,
        subtotal:               quote.subtotal,
        gst:                    quote.gst,
        total:                  quote.total,
        notes:                  quote.notes,
        terms:                  quote.terms,
        items: (items || []).map((item: any) => ({
          product_name: item.product_name || item.name || '(unnamed)',
          quantity:     item.quantity,
          unit_price:   item.unit_price,
          total:        item.total ?? item.line_total ?? (item.quantity * item.unit_price),
        })),
        customer_business_name: customer?.business_name || quote.customer_name || '',
        customer_email:         customer?.email || quote.customer_email || '',
        customer_address:       customer?.address || quote.customer_address || null,
        customer_phone:         customer?.phone || null,
        customer_abn:           customer?.abn || quote.customer_abn || null,
      },
      bakery: {
        name:    process.env.BAKERY_NAME    || '',
        email:   process.env.BAKERY_EMAIL   || '',
        phone:   process.env.BAKERY_PHONE   || '',
        address: process.env.BAKERY_ADDRESS || '',
        abn:     process.env.BAKERY_ABN     || '',
      },
    })

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
    const filename = `Quote-${quote.quote_number}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

  } catch (error: any) {
    console.error('Quote PDF error:', error)
    return NextResponse.json(
      { error: 'Failed to generate quote PDF', details: error.message },
      { status: 500 }
    )
  }
}