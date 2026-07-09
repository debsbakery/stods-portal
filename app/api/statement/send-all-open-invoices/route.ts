export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOpenStatement } from '@/lib/statement/build-open-statement'
import { generateOpenInvoicesPDF } from '@/lib/pdf/open-invoices'
import { Resend } from 'resend'
import pLimit from 'p-limit'

const resend = new Resend(process.env.RESEND_API_KEY)
const limit  = pLimit(3)

async function run(customerIds?: string[]) {
  const supabase = createAdminClient()

  let query = supabase
    .from('customers')
    .select('id, email, statement_email, business_name, contact_name, balance, payment_terms')
    .not('email', 'is', null)
    .gt('balance', 0)
  if (customerIds && customerIds.length > 0) query = query.in('id', customerIds)

  const { data: customers, error } = await query
  if (error) throw new Error(`Failed to fetch customers: ${error.message}`)
  if (!customers || customers.length === 0) {
    return { success: true, sent: 0, skipped: 0, failed: 0, total: 0, message: 'No customers with outstanding balances' }
  }

  const displayName = process.env.BAKERY_NAME || 'Bakery'
  const fromEmail   = process.env.RESEND_FROM_EMAIL || process.env.BAKERY_EMAIL || ''
  const displayFrom = `${process.env.RESEND_FROM_NAME || displayName} <${fromEmail}>`
  const headerHex   = '#006A4E'
  const subHex      = '#a7f3d0'

  let sent = 0, skipped = 0, failed = 0
  const errors: string[] = []

  await Promise.all(customers.map(customer => limit(async () => {
    try {
      const data = await buildOpenStatement(customer.id)

      if (data.invoices.length === 0) { skipped++; return }

      const pdfBuffer = await generateOpenInvoicesPDF(data)

      const customerName = customer.business_name || customer.contact_name || customer.email!
      const toEmail = customer.statement_email || customer.email!

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
              <p style="margin:0;font-size:14px;"><strong>Total Outstanding: $${data.totalOutstanding.toFixed(2)}</strong></p>
              <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
                ${data.invoices.length} open invoice${data.invoices.length !== 1 ? 's' : ''} —
                Payment Terms: ${customer.payment_terms ? `${customer.payment_terms} days` : '30 days'}
              </p>
            </div>
            <p style="color:#6b7280;font-size:13px;">Questions about your account? Please contact us.</p>
            <p style="margin-top:24px;">Kind regards,<br/>
              <strong style="color:${headerHex};">${displayName} Accounts Team</strong></p>
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

      sent++
      console.log(`[send-all-open] Sent to ${toEmail}`)
    } catch (err: any) {
      failed++
      errors.push(`${customer.business_name || customer.email}: ${err.message}`)
      console.error(`[send-all-open] Failed ${customer.email}:`, err.message)
    }
  })))

  return { success: true, sent, skipped, failed, total: customers.length, ...(errors.length > 0 && { errors }) }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await run())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    return NextResponse.json(await run(body.customerIds))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}