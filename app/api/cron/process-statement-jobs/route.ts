export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'

const resend      = new Resend(process.env.RESEND_API_KEY)
const resendStods = new Resend(process.env.STODS_RESEND_API_KEY)

const BATCH_SIZE = 50

export async function GET(request: NextRequest) {
  // ── Security ──────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Grab next batch of pending jobs ───────────────────────
  const { data: jobs, error: jobError } = await supabase
    .from('statement_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (jobError) {
    console.error('[PROCESSOR] Failed to fetch jobs:', jobError)
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    console.log('[PROCESSOR] No pending jobs — all done')
    return NextResponse.json({ success: true, processed: 0, remaining: 0 })
  }

  // ── Mark as processing (prevent double-processing) ─────────
  await supabase
    .from('statement_jobs')
    .update({ status: 'processing' })
    .in('id', jobs.map(j => j.id))

  // ── Fetch customers for this batch ────────────────────────
  const customerIds = jobs.map(j => j.customer_id)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, balance, address, payment_terms, invoice_brand')
    .in('id', customerIds)

  const customerMap = Object.fromEntries((customers ?? []).map(c => [c.id, c]))

  // ── Use period from first job (all jobs in batch share period) ──
  const { period_start: startDate, period_end: endDate, month_label: monthLabel } = jobs[0]

  // ── Batch fetch AR transactions for these customers ────────
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

  // ── Process each job in the batch ─────────────────────────
  let processed = 0

  for (const job of jobs) {
    const customer = customerMap[job.customer_id]

    if (!customer) {
      await supabase
        .from('statement_jobs')
        .update({ status: 'failed', error: 'Customer not found' })
        .eq('id', job.id)
      continue
    }

    try {
      const transactions = txByCustomer[customer.id]    ?? []
      const prior        = priorByCustomer[customer.id] ?? []

      // ── Opening balance ──────────────────────────────────
      const openingBalance = prior.reduce((sum, tx) => {
        const isCredit = tx.type === 'payment' || tx.type === 'credit'
        return sum + (isCredit ? -Number(tx.amount) : Number(tx.amount))
      }, 0)

      let runningBalance = openingBalance

      // ── Build statement lines ────────────────────────────
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

      // ── Brand config ─────────────────────────────────────
      const isStods    = customer.invoice_brand === 'stods'
      const bakeryName = isStods ? process.env.STODS_BAKERY_NAME       : process.env.BAKERY_NAME
      const fromName   = isStods ? process.env.STODS_RESEND_FROM_NAME  : process.env.RESEND_FROM_NAME
      const fromEmail  = isStods ? process.env.STODS_RESEND_FROM_EMAIL : process.env.RESEND_FROM_EMAIL
      const headerColor: [number, number, number] = isStods
        ? [0.584, 0.306, 0.129]
        : [0, 0.416, 0.306]

      const displayName = bakeryName || (isStods ? 'Stods Bakery' : "Deb's Bakery")
      const displayFrom = `${fromName || displayName} <${fromEmail || 'noreply@debsbakery.store'}>`
      const headerHex   = isStods ? '#955E30' : '#006A4E'
      const subHex      = isStods ? '#f5dcc8' : '#a7f3d0'

      // ── Generate PDF ─────────────────────────────────────
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

      // ── Send email ───────────────────────────────────────
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

      // ── Mark job as sent ─────────────────────────────────
      await supabase
        .from('statement_jobs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', job.id)

      processed++
      console.log(`[PROCESSOR] ✅ Sent to ${customer.email}`)

    } catch (err: any) {
      console.error(`[PROCESSOR] ❌ Failed ${customer.email}:`, err.message)
      await supabase
        .from('statement_jobs')
        .update({ status: 'failed', error: err.message })
        .eq('id', job.id)
    }
  }

  // ── Check how many still pending ──────────────────────────
  const { count: remaining } = await supabase
    .from('statement_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  console.log(`[PROCESSOR] Batch complete — processed: ${processed}, remaining: ${remaining ?? 0}`)

  return NextResponse.json({
    success:   true,
    processed,
    remaining: remaining ?? 0,
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