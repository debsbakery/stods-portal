export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOpenStatement } from '@/lib/statement/build-open-statement'
import { generateOpenInvoicesPDF } from '@/lib/pdf/open-invoices'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { customerId } = await params
    const supabase = createAdminClient()

    const { data: cust } = await supabase
      .from('customers')
      .select('email, statement_email, business_name, contact_name')
      .eq('id', customerId)
      .single()

    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    const toEmail = cust.statement_email || cust.email
    if (!toEmail) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

    const data = await buildOpenStatement(customerId)

    if (data.invoices.length === 0 && (data.customerBalance ?? 0) >= -0.01) {
      return NextResponse.json({ success: false, skipped: true, message: 'No open invoices — nothing to send' })
    }

    const displayName = process.env.BAKERY_NAME || 'Bakery'
    const fromEmail   = process.env.RESEND_FROM_EMAIL || process.env.BAKERY_EMAIL || ''
    const displayFrom = `${process.env.RESEND_FROM_NAME || displayName} <${fromEmail}>`
    const headerHex   = '#006A4E'
    const subHex      = '#a7f3d0'

    const pdfBuffer = await generateOpenInvoicesPDF(data)

    const customerName = cust.business_name || cust.contact_name || toEmail

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:${headerHex};padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">${displayName}</h1>
          <p style="color:${subHex};margin:4px 0 0;font-size:13px;">Open Invoice Statement</p>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p>Dear ${customerName},</p>
          <p>Please find attached a statement of your open invoices as at <strong>${data.asAt}</strong>.</p>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:16px;margin:20px 0;">
            <p style="margin:0;font-size:14px;">
              <strong>Total Outstanding: $${data.totalOutstanding.toFixed(2)}</strong>
            </p>
            <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
              ${data.invoices.length} open invoice${data.invoices.length !== 1 ? 's' : ''} —
              Payment Terms: ${data.customer.payment_terms || '30 days'}
            </p>
          </div>
          <p style="color:#6b7280;font-size:13px;">Questions about your account? Please contact us.</p>
          <p style="margin-top:24px;">Kind regards,<br/>
            <strong style="color:${headerHex};">${displayName} Accounts Team</strong>
          </p>
        </div>
      </div>
    `

    await resend.emails.send({
      from: displayFrom,
      to: toEmail,
      subject: `Open Invoice Statement — ${customerName}`,
      html: emailHtml,
      attachments: [{
        filename: `Open-Invoices-${customerName.replace(/\s+/g, '-')}-${data.asAt}.pdf`,
        content: pdfBuffer,
      }],
    })

    return NextResponse.json({ success: true, to: toEmail, totalOutstanding: data.totalOutstanding })
  } catch (error: any) {
    console.error('[open-invoices email]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}