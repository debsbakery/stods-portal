export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStatementPDF } from '@/lib/pdf/statement'

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createAdminClient()
    const { customerId } = await params

    const searchParams = request.nextUrl.searchParams
    const startDate    = searchParams.get('startDate')
    const endDate      = searchParams.get('endDate') || new Date().toISOString().split('T')[0]

    // Customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, email, address, balance, payment_terms')
      .eq('id', customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // AR transactions in period
    let txQuery = supabase
      .from('ar_transactions')
      .select('id, type, amount, amount_paid, description, created_at, invoice_id, due_date')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (startDate) txQuery = txQuery.gte('created_at', startDate)
    txQuery = txQuery.lte('created_at', endDate + 'T23:59:59')

    const { data: txRaw, error: txError } = await txQuery
    if (txError) throw new Error(txError.message)
    const transactions = txRaw ?? []

    // Payments in period
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

    // ✅ Fix — invoice_id is order_id, look up by order_id not id
    const invoiceIds = transactions
      .filter(t => t.invoice_id)
      .map(t => t.invoice_id as string)

    let invoiceMap: Record<string, string> = {}
    if (invoiceIds.length > 0) {
      // Try invoice_numbers table by order_id first
      const { data: invNums } = await supabase
        .from('invoice_numbers')
        .select('order_id, invoice_number')
        .in('order_id', invoiceIds)
      for (const inv of invNums ?? []) {
        if (inv.order_id) invoiceMap[inv.order_id] = String(inv.invoice_number)
      }

      // Fallback: orders.invoice_number
      const missing = invoiceIds.filter(id => !invoiceMap[id])
      if (missing.length > 0) {
        const { data: ordersWithInv } = await supabase
          .from('orders')
          .select('id, invoice_number')
          .in('id', missing)
        for (const o of ordersWithInv ?? []) {
          if (o.invoice_number) invoiceMap[o.id] = String(o.invoice_number)
        }
      }
    }

    // Opening balance BEFORE period
    let openingBalance = 0
    if (startDate) {
      const { data: priorTxRaw } = await supabase
        .from('ar_transactions')
        .select('amount, type')
        .eq('customer_id', customerId)
        .lt('created_at', startDate)

      const priorInvoiceTotal = (priorTxRaw ?? []).reduce((sum, tx) => {
        return sum + (tx.type === 'credit' ? -Number(tx.amount) : Number(tx.amount))
      }, 0)

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

    // Merge lines
    type RawLine = {
      date: string
      type: 'invoice' | 'credit' | 'payment'
      amount: number
      amount_paid: number
      description: string
      reference: string
      paid_status: 'paid' | 'partial' | 'unpaid' | 'na'
      due_date: string | null
    }

    const rawLines: RawLine[] = []

    for (const tx of transactions) {
      const isCredit   = tx.type === 'credit'
      const invoiceNum = tx.invoice_id ? invoiceMap[tx.invoice_id] : null
      const reference  = invoiceNum
        ? 'INV-' + String(invoiceNum).padStart(4, '0')
        : String(tx.type ?? '').toUpperCase()

      const txAmount = Number(tx.amount || 0)
      const amtPaid  = Number(tx.amount_paid || 0)

      const paidStatus: 'paid' | 'partial' | 'unpaid' | 'na' = isCredit
        ? 'na'
        : amtPaid >= txAmount - 0.01
          ? 'paid'
          : amtPaid > 0
            ? 'partial'
            : 'unpaid'

      // Build description matching ledger logic
      const rawDesc   = tx.description || ''
      const isGeneric = rawDesc.toLowerCase().includes('edited') ||
        rawDesc.toLowerCase().startsWith('invoice -') ||
        rawDesc.toLowerCase().startsWith('credit invoice') ||
        !rawDesc.match(/#\s*\d+/)

      let finalDescription: string
      if (invoiceNum) {
        const invStr = `Invoice #${String(invoiceNum).padStart(6, '0')}`
        const suffix = rawDesc.toLowerCase().includes('edited')
          ? ' (edited)'
          : isCredit ? ' (credit)' : ''
        const custPart = rawDesc.includes(' - ')
          ? ' - ' + rawDesc.split(' - ').slice(1).join(' - ')
          : ''
        finalDescription = isGeneric ? invStr + suffix + custPart : rawDesc
      } else {
        finalDescription = rawDesc || (isCredit ? 'Credit' : 'Invoice')
      }

      rawLines.push({
        date:        tx.created_at,
        type:        isCredit ? 'credit' : 'invoice',
        amount:      txAmount,
        amount_paid: amtPaid,
        description: finalDescription,
        reference,
        paid_status: paidStatus,
        due_date:    tx.due_date ?? null,
      })
    }

    for (const pmt of payments) {
      const method = pmt.payment_method ? pmt.payment_method.replace(/_/g, ' ') : 'payment'
      const ref    = pmt.reference_number ? ' - ' + pmt.reference_number : ''
      rawLines.push({
        date:        pmt.payment_date + 'T12:00:00',
        type:        'payment',
        amount:      Number(pmt.amount),
        amount_paid: 0,
        description: 'Payment received - thank you (' + method + ')' + ref,
        reference:   pmt.reference_number || 'PAYMENT',
        paid_status: 'na',
        due_date:    null,
      })
    }

    rawLines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

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
        paid_status:      raw.paid_status,
        amount_paid:      raw.amount_paid,
        due_date:         raw.due_date,
      }
    })

   // ── Ageing summary — only invoices within statement period ──
const now = new Date()
const aging = { current: 0, days30: 0, days60: 0, older: 0 }

let ageQuery = supabase
  .from('ar_transactions')
  .select('amount, amount_paid, due_date, created_at')
  .eq('customer_id', customerId)
  .eq('type', 'invoice')
  .lte('created_at', endDate + 'T23:59:59')

if (startDate) ageQuery = ageQuery.gte('created_at', startDate)

const { data: allInvoices } = await ageQuery

for (const inv of allInvoices ?? []) {
  const outstanding = Number(inv.amount) - Number(inv.amount_paid ?? 0)
  if (outstanding <= 0.01) continue

  const refDate = inv.due_date
    ? new Date(inv.due_date)
    : new Date(new Date(inv.created_at).getTime() + 30 * 86400000)

  const daysAgo = Math.floor((now.getTime() - refDate.getTime()) / 86400000)

  if (daysAgo <= 14)      aging.current += outstanding
  else if (daysAgo <= 30) aging.days30  += outstanding
  else if (daysAgo <= 60) aging.days60  += outstanding
  else                    aging.older   += outstanding
}

aging.current = Math.round(aging.current * 100) / 100
aging.days30  = Math.round(aging.days30  * 100) / 100
aging.days60  = Math.round(aging.days60  * 100) / 100
aging.older   = Math.round(aging.older   * 100) / 100

    const pdfBuffer = await generateStatementPDF({
      bakeryName:  process.env.BAKERY_NAME  ?? 'Kimbercrust Bakery',
      bakeryEmail: process.env.BAKERY_EMAIL ?? 'orders@kimbercrust.com',
      customer,
      lines,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(runningBalance  * 100) / 100,
      startDate,
      endDate,
      aging,
    })

    const safeName = (customer.business_name || customer.id)
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase()

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="statement-${safeName}-${endDate}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Error generating statement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate statement' },
      { status: 500 }
    )
  }
}