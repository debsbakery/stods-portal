export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'
import pLimit from 'p-limit'
const resend      = new Resend(process.env.RESEND_API_KEY)
const resendStods = new Resend(process.env.STODS_RESEND_API_KEY)
const limit  = pLimit(3)

export async function GET(request: NextRequest) {
  // ── Security ──────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const now       = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
    .toISOString().split('T')[0]
  const endDate   = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
    .toISOString().split('T')[0]

  const monthLabel = lastMonth.toLocaleString('en-AU', { month: 'long', year: 'numeric' })
  console.log(`[CRON] Monthly statements — ${monthLabel} (${startDate} to ${endDate})`)

  // ── Customers — include invoice_brand ─────────────────────
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, balance, address, payment_terms, invoice_brand')
    .gt('balance', 0)
    .not('email', 'is', null)

  if (error) {
    console.error('[CRON] Failed to fetch customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!customers || customers.length === 0) {
    console.log('[CRON] No customers with outstanding balance')
    return NextResponse.json({ success: true, sent: 0, message: 'No outstanding balances' })
  }

  const customerIds = customers.map(c => c.id)

  // ── Batch fetch AR data ───────────────────────────────────
  const [{ data: periodTxRaw }, { data: priorTxRaw }] = await Promise.all([
    supabase
      .from('ar_transactions')
      .select('id, type, amount, description, created_at, invoice_id, customer_id')
      .in('customer_id', customerIds)
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59')
      .order('created_at', { ascending: true }),

    supabase
      .from('ar_transactions')
      .select('amount, type, customer_id')
      .in('customer_id', customerIds)
      .lt('created_at', startDate),
  ])

  const periodTx = periodTxRaw ?? []
  const priorTx  = priorTxRaw  ?? []

  // ── Invoice number map ────────────────────────────────────
  const allInvoiceIds = [...new Set(
    periodTx.filter(t => t.invoice_id).map(t => t.invoice_id as string)
  )]

  let invoiceMap: Record<string, string> = {}
  if (allInvoiceIds.length > 0) {
    const { data: invNums } = await supabase
      .from('invoice_numbers')
      .select('id, invoice_number')
      .in('id', allInvoiceIds)
    for (const inv of invNums ?? []) {
      invoiceMap[inv.id] = inv.invoice_number
    }
  }

  const txByCustomer    = groupBy(periodTx, 'customer_id')
  const priorByCustomer = groupBy(priorTx,  'customer_id')

  let sent = 0, failed = 0
  const errors: string[] = []

  await Promise.all(
    customers.map(customer =>
      limit(async () => {
        try {
          const transactions = txByCustomer[customer.id]    ?? []
          const prior        = priorByCustomer[customer.id] ?? []

          const openingBalance = prior.reduce((sum, tx) => {
            const isCredit = tx.type === 'payment' || tx.type === 'credit'
            return sum + (isCredit ? -Number(tx.amount) : Number(tx.amount))
          }, 0)

          let runningBalance = openingBalance

        // REPLACE WITH:
const lines = transactions.map(tx => {
  const isPayment = tx.type === 'payment'
  const isCredit  = tx.type === 'credit'

  if (isPayment || isCredit) {
    runningBalance = runningBalance - Number(tx.amount)
  } else {
    runningBalance = runningBalance + Number(tx.amount)
  }

  const invoiceNum = tx.invoice_id ? invoiceMap[tx.invoice_id] : null
  const reference  = invoiceNum
    ? `INV-${String(invoiceNum).padStart(4, '0')}`
    : String(tx.type ?? '').toUpperCase()

  return {
    date:             tx.created_at,
    description:      isPayment
      ? 'Payment received — thank you'
      : isCredit
        ? (tx.description || 'Credit note')
        : (tx.description || reference),
    reference:        isCredit ? 'CREDIT' : reference,
    debit:            isPayment ? null : isCredit ? -Number(tx.amount) : Number(tx.amount),
    credit:           isPayment ? Number(tx.amount) : null,
    balance:          Math.round(runningBalance * 100) / 100,
    transaction_type: tx.type,
  }
})

          // ── Brand config per customer ─────────────────────
          const isStods      = customer.invoice_brand === 'stods'
          const bakeryName   = isStods ? process.env.STODS_BAKERY_NAME    : process.env.BAKERY_NAME
          const fromName     = isStods ? process.env.STODS_RESEND_FROM_NAME  : process.env.RESEND_FROM_NAME
          const fromEmail    = isStods ? process.env.STODS_RESEND_FROM_EMAIL : process.env.RESEND_FROM_EMAIL
          const headerColor: [number, number, number] = isStods
            ? [0.584, 0.306, 0.129]
            : [0, 0.416, 0.306]

          const displayName  = bakeryName || (isStods ? 'Stods Bakery' : "Deb's Bakery")
          const displayFrom  = `${fromName || displayName} <${fromEmail || 'noreply@debsbakery.store'}>`
          const headerHex    = isStods ? '#955E30' : '#006A4E'
          const subHex       = isStods ? '#f5dcc8' : '#a7f3d0'

          const pdfBuffer = await generateStatementPDF({
            customer,
            lines,
            openingBalance: Math.round(openingBalance * 100) / 100,
            closingBalance: Math.round(runningBalance  * 100) / 100,
            startDate,
            endDate,
            bakeryName:  displayName,
            headerColor,
          })

          const customerName =
            customer.business_name ||
            customer.contact_name  ||
            customer.email         ||
            'Valued Customer'

                 await (isStods ? resendStods : resend).emails.send({
            from:    displayFrom,
            to:      customer.email!,
            subject: `Account Statement — ${monthLabel}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:${headerHex};padding:24px;border-radius:8px 8px 0 0;">
                  <h1 style="color:white;margin:0;font-size:22px;">${displayName}</h1>
                  <p style="color:${subHex};margin:4px 0 0;font-size:13px;">Monthly Account Statement</p>
                </div>
                <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  <p>Dear ${customerName},</p>
                  <p>Please find attached your account statement for <strong>${monthLabel}</strong>.</p>
                  <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:16px;margin:20px 0;">
                    <p style="margin:0;font-size:14px;">
                      <strong>Outstanding Balance: $${parseFloat(String(customer.balance || 0)).toFixed(2)}</strong>
                    </p>
                    <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
                      Payment Terms: ${customer.payment_terms || 'Due on receipt'}
                    </p>
                  </div>
                  <p style="color:#6b7280;font-size:13px;">
                    If you have any questions about your account, please contact us.
                  </p>
                  <p style="margin-top:24px;">
                    Kind regards,<br/>
                    <strong style="color:${headerHex};">${displayName} Accounts Team</strong>
                  </p>
                </div>
              </div>
            `,
            attachments: [{
              filename: `Statement-${(customer.business_name || customer.id).replace(/\s+/g, '-')}-${monthLabel.replace(' ', '-')}.pdf`,
              content:  pdfBuffer,
            }],
          })

          sent++
          console.log(`[CRON] Sent to ${customer.email} (${isStods ? 'Stods' : 'Debs'})`)

        } catch (err: any) {
          failed++
          errors.push(`${customer.business_name || customer.email}: ${err.message}`)
          console.error(`[CRON] Failed ${customer.email}:`, err.message)
        }
      })
    )
  )

  await supabase.from('statement_send_log').insert({
    sent_at:    new Date().toISOString(),
    period:     monthLabel,
    sent_count: sent,
    fail_count: failed,
    errors:     errors.length > 0 ? errors : null,
  }).then(() => {})

  console.log(`[CRON] Complete — Sent: ${sent}, Failed: ${failed}`)

  return NextResponse.json({
    success: true, sent, failed, period: monthLabel,
    ...(errors.length > 0 && { errors }),
  })
}

function groupBy<T extends Record<string, any>>(arr: T[], key: string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const g = item[key]
    acc[g] = acc[g] ?? []
    acc[g].push(item)
    return acc
  }, {} as Record<string, T[]>)
}