export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import { generateQuotePDF } from '@/lib/pdf/quote'
import { randomUUID } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminClient()
    const { id } = await params

    // Fetch quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Fetch items
    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order')

    // Fetch customer
    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, email, address, phone, abn')
      .eq('id', quote.customer_id)
      .single()

    if (!customer?.email) {
      return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })
    }

    // Generate token if not set
    let token = quote.token
    if (!token) {
      token = randomUUID()
      await supabase.from('quotes').update({ token }).eq('id', id)
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
        customer_business_name: customer.business_name || quote.customer_name || '',
        customer_email:         customer.email || '',
        customer_address:       customer.address || null,
        customer_phone:         customer.phone || null,
        customer_abn:           customer.abn || null,
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

    // Build email
    const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const quoteLink  = `${siteUrl}/quote/${token}`
    const bakeryName = process.env.BAKERY_NAME || 'Our Bakery'
    const fromName   = process.env.RESEND_FROM_NAME  || bakeryName
    const fromEmail  = process.env.RESEND_FROM_EMAIL || 'orders@norbakebroome.com'

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Quote from ${bakeryName}</h2>
        <p>Hi ${customer.business_name || 'there'},</p>
        <p>Please find attached your quote <strong>${quote.quote_number}</strong> for a total of <strong>$${quote.total?.toFixed(2)} (inc GST)</strong>.</p>
        ${quote.valid_until ? `<p>This quote is valid until <strong>${new Date(quote.valid_until).toLocaleDateString('en-AU')}</strong>.</p>` : ''}
        <p>You can also view and respond to this quote online:</p>
        <p style="margin: 20px 0;">
          <a href="${quoteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View Quote
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">If you have any questions, please reply to this email or call us at ${process.env.BAKERY_PHONE || ''}.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 11px;">${bakeryName} · ${process.env.BAKERY_ADDRESS || ''}</p>
      </div>
    `

    // Send email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: customer.email,
      subject: `Quote ${quote.quote_number} from ${bakeryName}`,
      html,
      attachments: [
        {
          filename: `Quote-${quote.quote_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    if (emailError) {
      console.error('Email send error:', emailError)
      return NextResponse.json({ error: emailError.message }, { status: 500 })
    }

    // Update quote status
    await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        token,
      })
      .eq('id', id)

    console.log(`✅ Quote ${quote.quote_number} sent to ${customer.email}`)

    return NextResponse.json({
      success: true,
      emailId: emailData?.id,
      sentTo: customer.email,
    })

  } catch (error: any) {
    console.error('Quote send error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send quote' },
      { status: 500 }
    )
  }
}