export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'
import pLimit from 'p-limit'

const resend      = new Resend(process.env.RESEND_API_KEY)
const resendStods = new Resend(process.env.STODS_RESEND_API_KEY)
const limit       = pLimit(3)

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const { customerIds, balanceOnly = true } = body

    const now       = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const startDate: string = body.startDate
      ?? new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
           .toISOString().split('T')[0]

    const endDate: string = body.endDate
      ?? new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
           .toISOString().split('T')[0]

    const monthLabel = lastMonth.toLocaleString('en-AU', {
      month: 'long',
      year:  'numeric',
    })

    // ── Fetch customers — include statement_email ───────────────────
    let query = supabase
      .from('customers')
      .select('id, email, email_2, statement_email, business_name, contact_name, balance, address, payment_terms, invoice_brand')
      .not('email', 'is', null)

    if (balanceOnly) query = query.gt('balance', 0)
    if (customerIds && customerIds.length > 0) query = query.in('id', customerIds)

    const { data: customers, error: customersError } = await query

    if (customersError) {
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true, sent: 0, failed: 0, total: 0,
        message: 'No customers to send statements to',
      })
    }

    const allCustomerIds = customers.map(c => c.id)

    // ── Batch fetch AR transactions AND payments ────────────────────
    const [
      { data: periodTxRaw },
      { data: priorTxRaw },
      { data: periodPmtsRaw },
      { data: priorPmtsRaw },
    ] = await Promise.all([
      supabase
        .from('ar_transactions')
        .select('id, type, amount, amount_paid, description, created_at, invoice_id, customer_id')
        .in('customer_id', allCustomerIds)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: true }),

      supabase
        .from('ar_transactions')
        .select('amount, type, customer_id')
        .in('customer_id', allCustomerIds)
        .lt('created_at', startDate),

      // 🆕 Period payments (cash receipts)
      supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, reference_number, customer_id')
        .in('customer_id', allCustomerIds)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: true }),

      // 🆕 Prior payments (for opening balance)
      supabase
        .from('payments')
        .select('amount, customer_id')
        .in('customer_id', allCustomerIds)
        .lt('payment_date', startDate),
    ])

    const periodTx   = periodTxRaw   ?? []
    const priorTx    = priorTxRaw    ?? []
    const periodPmts = periodPmtsRaw ?? []
    const priorPmts  = priorPmtsRaw  ?? []

    // ── Invoice number map ──────────────────────────────────────────
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

    const txByCustomer       = groupBy(periodTx,   'customer_id')
    const priorByCustomer    = groupBy(priorTx,    'customer_id')
    const pmtsByCustomer     = groupBy(periodPmts, 'customer_id')
    const priorPmtByCustomer = groupBy(priorPmts,  'customer_id')

    let sent   = 0
    let failed = 0
    const errors: string[] = []

    await Promise.all(
      customers.map(customer =>
        limit(async () => {
          try {
            const transactions   = txByCustomer[customer.id]       ?? []
            const prior          = priorByCustomer[customer.id]    ?? []
            const periodPayments = pmtsByCustomer[customer.id]     ?? []
            const priorPayments  = priorPmtByCustomer[customer.id] ?? []

            // ── Opening balance: prior invoices/credits MINUS prior payments ──
            const priorInvoiceTotal = prior.reduce((sum, tx) => {
              return sum + (tx.type === 'credit' ? -Number(tx.amount) : Number(tx.amount))
            }, 0)

            const priorPaymentTotal = priorPayments.reduce(
              (sum, p) => sum + Number(p.amount), 0
            )

            const openingBalance = priorInvoiceTotal - priorPaymentTotal

            // ── Build unified timeline (transactions + payments) ──
            type RawLine = {
              date: string
              type: 'invoice' | 'credit' | 'payment'
              amount: number
              description: string
              reference: string
            }

            const rawLines: RawLine[] = []

            for (const tx of transactions) {
              const isCredit   = tx.type === 'credit'
              const invoiceNum = tx.invoice_id ? invoiceMap[tx.invoice_id] : null
              const reference  = invoiceNum
                ? `INV-${String(invoiceNum).padStart(4, '0')}`
                : String(tx.type ?? '').toUpperCase()

              rawLines.push({
                date:        tx.created_at,
                type:        isCredit ? 'credit' : 'invoice',
                amount:      Number(tx.amount),
                description: isCredit
                  ? (tx.description || 'Credit note')
                  : (tx.description || reference),
                reference:   isCredit ? 'CREDIT' : reference,
              })
            }

            for (const pmt of periodPayments) {
              const method = pmt.payment_method
                ? pmt.payment_method.replace(/_/g, ' ')
                : 'payment'
              rawLines.push({
                date:        pmt.payment_date + 'T12:00:00',
                type:        'payment',
                amount:      Number(pmt.amount),
                description: `Payment received - thank you (${method})`,
                reference:   pmt.reference_number || 'PAYMENT',
              })
            }

            rawLines.sort((a, b) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            )

            let runningBalance = openingBalance

            const lines = rawLines.map(rl => {
              const isCredit = rl.type === 'payment' || rl.type === 'credit'
              runningBalance = isCredit
                ? runningBalance - rl.amount
                : runningBalance + rl.amount

              return {
                date:             rl.date,
                description:      rl.description,
                reference:        rl.reference,
                debit:            isCredit ? null : rl.amount,
                credit:           isCredit ? rl.amount : null,
                balance:          Math.round(runningBalance * 100) / 100,
                transaction_type: rl.type,
              }
            })

            // ── Brand config per customer ────────────────────────────
            const isStods       = customer.invoice_brand === 'stods'
            const bakeryName    = isStods ? process.env.STODS_BAKERY_NAME       : process.env.BAKERY_NAME
            const fromName      = isStods ? process.env.STODS_RESEND_FROM_NAME  : process.env.RESEND_FROM_NAME
            const fromEmail     = isStods ? process.env.STODS_RESEND_FROM_EMAIL : process.env.RESEND_FROM_EMAIL
            const headerColor: [number, number, number] = isStods
              ? [0.584, 0.306, 0.129]
              : [0, 0.416, 0.306]

            const displayName  = bakeryName  || (isStods ? 'Stods Bakery' : "Deb's Bakery")
            const displayFrom  = `${fromName || displayName} <${fromEmail || 'noreply@debsbakery.store'}>`
            const headerHex    = isStods ? '#955E30' : '#006A4E'
            const subHex       = isStods ? '#f5dcc8' : '#a7f3d0'

            const closingBalance = Math.round(runningBalance * 100) / 100

            // ── Generate PDF ─────────────────────────────────────────
            const pdfBuffer = await generateStatementPDF({
              customer,
              lines,
              openingBalance: Math.round(openingBalance * 100) / 100,
              closingBalance,
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

            // ── Resolve statement email ──────────────────────────────
            const toEmail = customer.statement_email || customer.email!
            console.log(`[send-all] Statement to: ${toEmail}${customer.statement_email ? ' (statement_email)' : ' (primary)'}`)

            const emailHtml = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:${headerHex};padding:24px;border-radius:8px 8px 0 0;">
                  <h1 style="color:white;margin:0;font-size:22px;">${displayName}</h1>
                  <p style="color:${subHex};margin:4px 0 0;font-size:13px;">
                    Monthly Account Statement
                  </p>
                </div>
                <div style="padding:24px;border:1px solid #e5e7eb;
                            border-top:none;border-radius:0 0 8px 8px;">
                  <p>Dear ${customerName},</p>
                  <p>Please find attached your account statement for
                     <strong>${monthLabel}</strong>.</p>
                  <div style="background:#fef3c7;border:1px solid #f59e0b;
                              border-radius:6px;padding:16px;margin:20px 0;">
                    <p style="margin:0;font-size:14px;">
                      <strong>
                        Outstanding Balance:
                        $${parseFloat(String(customer.balance || 0)).toFixed(2)}
                      </strong>
                    </p>
                    <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
                      Payment Terms: ${customer.payment_terms || 'Due on receipt'}
                    </p>
                  </div>
                  <p style="color:#6b7280;font-size:13px;">
                    Questions about your account? Please contact us.
                  </p>
                  <p style="margin-top:24px;">
                    Kind regards,<br/>
                    <strong style="color:${headerHex};">${displayName} Accounts Team</strong>
                  </p>
                </div>
              </div>
            `

            const attachment = {
              filename: `Statement-${customerName.replace(/\s+/g, '-')}-${monthLabel.replace(' ', '-')}.pdf`,
              content:  pdfBuffer,
            }

            // ── Send to statement email (or primary) ─────────────────
            await (isStods ? resendStods : resend).emails.send({
              from:        displayFrom,
              to:          toEmail,
              subject:     `Account Statement — ${monthLabel}`,
              html:        emailHtml,
              attachments: [attachment],
            })

            sent++
            console.log(`[send-all] Sent to ${toEmail} (${isStods ? 'Stods' : 'Debs'})`)

          } catch (err: any) {
            console.error(`[send-all] Failed ${customer.email}:`, err.message)
            failed++
            errors.push(`${customer.business_name || customer.email}: ${err.message}`)
          }
        })
      )
    )

    return NextResponse.json({
      success: true, sent, failed,
      total:   customers.length,
      period:  monthLabel,
      ...(errors.length > 0 && { errors }),
    })

  } catch (error: any) {
    console.error('[send-all] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send statements' },
      { status: 500 }
    )
  }
}

function groupBy<T extends Record<string, any>>(
  arr: T[],
  key: string
): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const g = item[key]
    acc[g]  = acc[g] ?? []
    acc[g].push(item)
    return acc
  }, {} as Record<string, T[]>)
}