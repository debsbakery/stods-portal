export const dynamic = 'force-dynamic'

import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, html, customerId, orderId } = body;  // 🆕 orderId

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    // ── Check customer brand ─────────────────────────────────────
    let isStodsBrand = false

    if (customerId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: customer } = await supabase
        .from('customers')
        .select('invoice_brand')
        .eq('id', customerId)
        .single()

      isStodsBrand = customer?.invoice_brand === 'stods'
    }

    // ── Pick from address based on brand ─────────────────────────
    const fromName  = isStodsBrand
      ? (process.env.STODS_RESEND_FROM_NAME  || 'Stods Bakery')
      : (process.env.RESEND_FROM_NAME        || process.env.STODS_RESEND_FROM_NAME ?? "Stods Bakery")

    const fromEmail = isStodsBrand
      ? (process.env.STODS_RESEND_FROM_EMAIL || 'orders@stodsbakery.com')
      : (process.env.RESEND_FROM_EMAIL       || process.env.STODS_RESEND_FROM_EMAIL ?? 'orders@stodsbakery.com')

    const from = `${fromName} <${fromEmail}>`

    // 🆕 Auto-fetch PDF attachment if orderId provided
    let attachments: any[] | undefined = undefined
    if (orderId) {
      try {
        const siteUrl = isStodsBrand
          ? (process.env.STODS_SITE_URL       ?? 'https://orders.stodsbakery.com')
          : (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.STODS_SITE_URL ?? 'https://orders.stodsbakery.com')

        const pdfRes = await fetch(`${siteUrl}/api/invoice/${orderId}?download=true`)
        if (pdfRes.ok) {
          const buf = Buffer.from(await pdfRes.arrayBuffer())
          attachments = [{
            filename:    `Invoice-${orderId.slice(0, 8)}.pdf`,
            content:     buf,
            contentType: 'application/pdf',
          }]
          console.log(`📄 PDF attached: ${buf.length} bytes`)
        } else {
          console.warn(`PDF fetch returned ${pdfRes.status} for order ${orderId}`)
        }
      } catch (err) {
        console.warn('Failed to fetch PDF for attachment:', err)
      }
    }

    console.log('📧 Sending email:', {
      from,
      to,
      subject:        subject.substring(0, 50),
      hasAttachment:  !!attachments,
    })

    const emailPayload: any = { from, to, subject, html }
    if (attachments) emailPayload.attachments = attachments

    const { data, error } = await resend.emails.send(emailPayload)

    if (error) {
      console.error('❌ Resend API error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Email sent:', { to, emailId: data?.id })

    return NextResponse.json({
      success:     true,
      emailId:     data?.id,
      sentFrom:    from,
      pdfAttached: !!attachments,
    })

  } catch (error: any) {
    console.error('🔴 Send-email error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}