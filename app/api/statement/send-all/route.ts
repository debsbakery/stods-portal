// app/api/statement/send-all/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'
import pLimit from 'p-limit'

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")
const limit  = pLimit(3)

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

    // ── Fetch customers ───────────────────────────────────────
    let query = supabase
      .from('customers')
      .select('id, email, business_name, contact_name, balance, address, payment_terms')
      .not('email', 'is', null)

    if (balanceOnly) {
      query = query.gt('balance', 0)
    }

    if (customerIds && customerIds.length > 0) {
      query = query.in('id', customerIds)
    }

    const { data: customers, error: customersError } = await query

    if (customersError) {
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true,
        sent:    0,
        failed:  0,
        total:   0,
        message: 'No customers to send statements to',
      })
    }

    const allCustomerIds = customers.map(c => c.id)

    // ── Batch fetch AR transactions — 2 queries ───────────────
    // Column names: type (not transaction_type), invoice_id (not order_id)
    const [{ data: periodTxRaw }, { data: priorTxRaw }] = await Promise.all([
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
    ])

    // Always arrays — never null
    const periodTx = periodTxRaw ?? []
    const priorTx  = priorTxRaw  ?? []

    // ── Batch fetch invoice numbers via invoice_id ────────────
    // invoice_id on ar_transactions links to invoice_numbers.id
    const allInvoiceIds = [
      ...new Set(
        periodTx
          .filter(t => t.invoice_id)
          .map(t => t.invoice_id as string)
      )
    ]

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

    // ── Group by customer_id for O(1) lookup ──────────────────
    const txByCustomer    = groupBy(periodTx, 'customer_id')
    const priorByCustomer = groupBy(priorTx,  'customer_id')

    let sent   = 0
    let failed = 0
    const errors: string[] = []

    // ── Process each customer concurrently (max 3 at once) ────
    await Promise.all(
      customers.map(customer =>
        limit(async () => {
          try {
            const transactions = txByCustomer[customer.id]    ?? []
            const prior        = priorByCustomer[customer.id] ?? []

            // Opening balance from all AR before period
            const openingBalance = prior.reduce((sum, tx) => {
              const isCredit = tx.type === 'payment' || tx.type === 'credit'
              return sum + (isCredit ? -Number(tx.amount) : Number(tx.amount))
            }, 0)

            // Build statement lines with running balance
            let runningBalance = openingBalance

            const lines = transactions.map(tx => {
              const isCredit = tx.type === 'payment' || tx.type === 'credit'

              runningBalance = isCredit
                ? runningBalance - Number(tx.amount)
                : runningBalance + Number(tx.amount)

              const invoiceNum = tx.invoice_id
                ? invoiceMap[tx.invoice_id]
                : null

              const reference = invoiceNum
                ? `INV-${String(invoiceNum).padStart(4, '0')}`
                : String(tx.type ?? '').toUpperCase()

              return {
                date:             tx.created_at,
                description:      isCredit
                  ? (tx.type === 'credit'
                      ? 'Credit note'
                      : 'Payment received - thank you')
                  : (tx.description || reference),
                reference,
                debit:            isCredit ? null : Number(tx.amount),
                credit:           isCredit ? Number(tx.amount) : null,
                balance:          Math.round(runningBalance * 100) / 100,
                transaction_type: tx.type,
              }
            })

            // Generate PDF
            const pdfBuffer = await generateStatementPDF({
              customer,
              lines,
              openingBalance: Math.round(openingBalance  * 100) / 100,
              closingBalance: Math.round(runningBalance  * 100) / 100,
              startDate,
              endDate,
            })

            const customerName =
              customer.business_name ||
              customer.contact_name  ||
              customer.email         ||
              'Valued Customer'

            // Send via Resend
            await resend.emails.send({
              from:    "Stods Bakery <noreply@debsbakery.store>",
              to:      customer.email!,
              subject: `Account Statement — ${monthLabel}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <div style="background:#3E1F00;padding:24px;border-radius:8px 8px 0 0;">
                    <h1 style="color:white;margin:0;font-size:22px;">Stods Bakery</h1>
                    <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px;">
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
                      <strong style="color:#3E1F00;">Stods Bakery Accounts Team</strong>
                    </p>
                  </div>
                </div>
              `,
              attachments: [{
                filename: `Statement-${customerName.replace(/\s+/g, '-')}-${monthLabel.replace(' ', '-')}.pdf`,
                content:  pdfBuffer,
              }],
            })

            console.log(`[send-all] Sent to ${customer.email}`)
            sent++

          } catch (err: any) {
            console.error(`[send-all] Failed ${customer.email}:`, err.message)
            failed++
            errors.push(`${customer.business_name || customer.email}: ${err.message}`)
          }
        })
      )
    )

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total:  customers.length,
      period: monthLabel,
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
