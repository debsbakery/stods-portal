// app/api/statement/send-all/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'
import pLimit from 'p-limit'

const resend = new Resend(process.env.RESEND_API_KEY)
const limit  = pLimit(3)

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient() // ← admin, no await

    // Accept optional params from body — falls back to last month
    const body = await request.json().catch(() => ({}))

    // If specific customerIds passed, use those
    // If balanceOnly = true, only customers with balance > 0
    // Default: last complete month
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
      year: 'numeric',
    })

    // ── Fetch customers ───────────────────────────────────────
    let query = supabase
      .from('customers')
      .select('id, email, business_name, contact_name, balance, address, payment_terms')
      .not('email', 'is', null)

    // Filter by balance if requested
    if (balanceOnly) {
      query = query.gt('balance', 0)
    }

    // Filter to specific customers if provided
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
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No customers to send statements to',
      })
    }

    const allCustomerIds = customers.map(c => c.id)

    // ── Batch fetch AR transactions — 2 queries total ─────────
    const [{ data: periodTx }, { data: priorTx }] = await Promise.all([
      // Transactions within the statement period
      supabase
        .from('ar_transactions')
        .select('id, transaction_type, amount, description, created_at, order_id, customer_id')
        .in('customer_id', allCustomerIds)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: true }),

      // Prior transactions for opening balance
      supabase
        .from('ar_transactions')
        .select('amount, transaction_type, customer_id')
        .in('customer_id', allCustomerIds)
        .lt('created_at', startDate),
    ])

    // ── Batch fetch invoice numbers ───────────────────────────
    const allOrderIds = [
      ...new Set((periodTx ?? []).filter(t => t.order_id).map(t => t.order_id))
    ]

    let invoiceMap: Record<string, string> = {}
    if (allOrderIds.length > 0) {
      const { data: invNums } = await supabase
        .from('invoice_numbers')
        .select('order_id, invoice_number')
        .in('order_id', allOrderIds)
      invoiceMap = Object.fromEntries(
        (invNums ?? []).map(i => [i.order_id, i.invoice_number])
      )
    }

    // ── Group by customer for O(1) lookup ─────────────────────
    const txByCustomer    = groupBy(periodTx ?? [], 'customer_id')
    const priorByCustomer = groupBy(priorTx  ?? [], 'customer_id')

    let sent   = 0
    let failed = 0
    const errors: string[] = []

    // ── Process each customer concurrently (max 3 at a time) ──
    await Promise.all(
      customers.map(customer =>
        limit(async () => {
          try {
            const transactions = txByCustomer[customer.id]    ?? []
            const prior        = priorByCustomer[customer.id] ?? []

            // Calculate opening balance from prior AR transactions
            const openingBalance = prior.reduce((sum, tx) => {
              const isCredit =
                tx.transaction_type === 'payment' ||
                tx.transaction_type === 'credit'
              return sum + (isCredit ? -tx.amount : tx.amount)
            }, 0)

            // Build statement lines with running balance
            let runningBalance = openingBalance
            const lines = transactions.map(tx => {
              const isCredit =
                tx.transaction_type === 'payment' ||
                tx.transaction_type === 'credit'

              runningBalance = isCredit
                ? runningBalance - tx.amount
                : runningBalance + tx.amount

              const invoiceNum = tx.order_id ? invoiceMap[tx.order_id] : null
              const reference  = invoiceNum
                ? `INV-${String(invoiceNum).padStart(4, '0')}`
                : tx.transaction_type.toUpperCase()

              return {
                date: tx.created_at,
                description: isCredit
                  ? tx.transaction_type === 'credit'
                    ? 'Credit note'
                    : 'Payment received - thank you'
                  : reference,
                reference,
                debit:            isCredit ? null : tx.amount,
                credit:           isCredit ? tx.amount : null,
                balance:          Math.round(runningBalance * 100) / 100,
                transaction_type: tx.transaction_type,
              }
            })

            // Generate PDF with new signature
            const pdfBuffer = await generateStatementPDF({
              customer,
              lines,
              openingBalance:  Math.round(openingBalance  * 100) / 100,
              closingBalance:  Math.round(runningBalance  * 100) / 100,
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
              from:    "Deb's Bakery <noreply@debsbakery.store>",
              to:      customer.email!,
              subject: `Account Statement — ${monthLabel}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <div style="background:#006A4E;padding:24px;border-radius:8px 8px 0 0;">
                    <h1 style="color:white;margin:0;font-size:22px;">Deb's Bakery</h1>
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
                      <strong style="color:#006A4E;">Deb's Bakery Accounts Team</strong>
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
    const g   = item[key]
    acc[g]    = acc[g] ?? []
    acc[g].push(item)
    return acc
  }, {} as Record<string, T[]>)
}