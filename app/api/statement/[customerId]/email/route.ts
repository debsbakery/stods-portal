export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'
import { emailConfig } from '@/lib/email-config'

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createAdminClient()
    const { customerId } = await params

    const searchParams = request.nextUrl.searchParams
    const startDate    = searchParams.get('startDate')
    const endDate      = searchParams.get('endDate')
      || new Date().toISOString().split('T')[0]

    // ── Customer ──────────────────────────────────────────────
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, email, address, balance, payment_terms')
      .eq('id', customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (!customer.email) {
      return NextResponse.json(
        { error: 'Customer has no email address on file' },
        { status: 400 }
      )
    }

    // ── Fetch AR transactions (invoices + credits) ────────────
    let txQuery = supabase
      .from('ar_transactions')
      .select('id, type, amount, description, created_at, invoice_id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (startDate) txQuery = txQuery.gte('created_at', startDate)
    txQuery = txQuery.lte('created_at', endDate + 'T23:59:59')

    const { data: txRaw, error: txError } = await txQuery
    if (txError) throw new Error(txError.message)
    const transactions = txRaw ?? []

    // ── Fetch payments in period ──────────────────────────────
    let pmtQuery = supabase
      .from('payments')
      .select('id, amount, payment_date, payment_method, reference_number')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: true })

    if (startDate) pmtQuery = pmtQuery.gte('payment_date', startDate)
    pmtQuery = pmtQuery.lte('payment_date', endDate)

    const { data: pmtRaw, error: pmtError } = await pmtQuery
    if (pmtError) throw new Error(pmtError.message)
    const payments = pmtRaw ?? []

    // ── Invoice number map ────────────────────────────────────
    const invoiceIds = transactions
      .filter(t => t.invoice_id)
      .map(t => t.invoice_id as string)

    let invoiceMap: Record<string, string> = {}
    if (invoiceIds.length > 0) {
      const { data: invNums } = await supabase
        .from('invoice_numbers')
        .select('id, invoice_number')
        .in('id', invoiceIds)

      for (const inv of invNums ?? []) {
        invoiceMap[inv.id] = inv.invoice_number
      }
    }

    // ── Opening balance BEFORE period ─────────────────────────
    let openingBalance = 0

    if (startDate) {
      // Prior invoices/credits
      const { data: priorTxRaw } = await supabase
        .from('ar_transactions')
        .select('amount, type')
        .eq('customer_id', customerId)
        .lt('created_at', startDate)

      const priorInvoiceTotal = (priorTxRaw ?? []).reduce((sum, tx) => {
        const isCredit = tx.type === 'credit'
        return sum + (isCredit ? -Number(tx.amount) : Number(tx.amount))
      }, 0)

      // Prior payments
      const { data: priorPmtRaw } = await supabase
        .from('payments')
        .select('amount')
        .eq('customer_id', customerId)
        .lt('payment_date', startDate)

      const priorPaymentTotal = (priorPmtRaw ?? []).reduce(
        (sum, p) => sum + Number(p.amount), 0
      )

      openingBalance = priorInvoiceTotal - priorPaymentTotal
    }

    // ── Merge invoices + payments into unified sorted lines ────
    type RawLine = {
      date: string
      type: 'invoice' | 'credit' | 'payment'
      amount: number
      description: string
      reference: string
    }

    const rawLines: RawLine[] = []

    // Invoice / credit lines
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
        description: tx.description || reference,
        reference,
      })
    }

    // Payment lines
    for (const pmt of payments) {
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

    // Sort by date ascending
    rawLines.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // ── Build final lines with running balance ─────────────────
    let runningBalance = openingBalance

    const lines = rawLines.map(raw => {
      const isCredit = raw.type === 'payment' || raw.type === 'credit'

      runningBalance = isCredit
        ? runningBalance - raw.amount
        : runningBalance + raw.amount

      return {
        date:             raw.date,
        description:      raw.description,
        reference:        raw.reference,
        debit:            isCredit ? null : raw.amount,
        credit:           isCredit ? raw.amount : null,
        balance:          Math.round(runningBalance * 100) / 100,
        transaction_type: raw.type,
      }
    })

    // ── Generate PDF ──────────────────────────────────────────
    const pdfBuffer = await generateStatementPDF({
      customer,
      lines,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(runningBalance  * 100) / 100,
      startDate,
      endDate,
    })

    // ── Period label for email ────────────────────────────────
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-AU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })

    const periodLabel = startDate
      ? `${fmtDate(startDate)} to ${fmtDate(endDate)}`
      : `Up to ${fmtDate(endDate)}`

    const customerName =
      customer.business_name ||
      customer.contact_name  ||
      'Valued Customer'

    const closingBalance = Math.round(runningBalance * 100) / 100

    // ── Send via Resend ───────────────────────────────────────
    const { error: sendError } = await resend.emails.send({
      from: emailConfig.fromAddress,
    replyTo: emailConfig.replyTo,
      to:      customer.email,
      subject: `Account Statement - ${customerName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">

          <div style="background:#3E1F00;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="color:white;margin:0;font-size:22px;">Stods Bakery</h1>
            <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px;">
              Account Statement
            </p>
          </div>

          <div style="padding:24px;border:1px solid #e5e7eb;
                      border-top:none;border-radius:0 0 8px 8px;">

            <p>Dear ${customerName},</p>
            <p>Please find attached your account statement for:</p>

            <div style="background:#f5f5f5;padding:15px;
                        border-radius:6px;margin:20px 0;">
              <p style="margin:5px 0;">
                <strong>Period:</strong> ${periodLabel}
              </p>
              <p style="margin:5px 0;">
                <strong>Closing Balance:</strong>
                $${closingBalance > 0 ? closingBalance.toFixed(2) : '0.00'}
              </p>
              <p style="margin:5px 0;font-size:12px;color:#6b7280;">
                Payment Terms: ${customer.payment_terms || 'Due on receipt'}
              </p>
            </div>

            ${closingBalance > 0 ? `
              <div style="background:#fef3c7;border:1px solid #f59e0b;
                          border-radius:6px;padding:12px;margin:16px 0;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  <strong>Payment is due.</strong>
                  Please arrange payment at your earliest convenience.
                </p>
              </div>
            ` : `
              <div style="background:#f0fdf4;border:1px solid #86efac;
                          border-radius:6px;padding:12px;margin:16px 0;">
                <p style="margin:0;font-size:13px;color:#166534;">
                  Your account is up to date. Thank you!
                </p>
              </div>
            `}

            <p style="color:#6b7280;font-size:13px;">
              If you have any questions about your account, please contact us.
            </p>

            <p style="margin-top:24px;">
              Kind regards,<br/>
              <strong style="color:#3E1F00;">Stods Bakery Accounts Team</strong>
            </p>

          </div>
        </div>
      `,
      attachments: [{
        filename: `Statement-${customerName.replace(/\s+/g, '-')}-${endDate}.pdf`,
        content:  pdfBuffer,
      }],
    })

    if (sendError) throw new Error(sendError.message)

    return NextResponse.json({
      success: true,
      message: `Statement sent to ${customer.email}`,
    })

  } catch (error: any) {
    console.error('Error emailing statement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send statement' },
      { status: 500 }
    )
  }
}
