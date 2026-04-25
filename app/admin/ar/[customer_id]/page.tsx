export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import StatementActions from '@/components/ar/StatementActions'
import CustomerLedgerClient from './customer-ledger-client'
import GstSummaryClient from './gst-summary-client'
import TabView from './tab-view'

async function getCustomerLedger(customerId: string) {
  const supabase = createAdminClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (!customer) return null

  const { data: arTxRaw, error: arError } = await supabase
    .from('ar_transactions')
    .select('id, type, amount, amount_paid, description, created_at, invoice_id, due_date')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })

  if (arError) {
    console.error('AR fetch error:', arError)
    throw new Error(arError.message)
  }

  const { data: pmtRaw } = await supabase
    .from('payments')
    .select('id, amount, payment_date, payment_method, reference_number')
    .eq('customer_id', customerId)
    .order('payment_date', { ascending: true })

  // Build invoice/order maps from invoice_numbers table
  const invoiceIds = (arTxRaw ?? [])
    .filter((t: any) => t.invoice_id)
    .map((t: any) => t.invoice_id as string)

  let invoiceMap: Record<string, number> = {}
  let orderIdMap: Record<string, string> = {}

  if (invoiceIds.length > 0) {
    const { data: invNums } = await supabase
      .from('invoice_numbers')
      .select('id, invoice_number, order_id')
      .in('order_id', invoiceIds)
    for (const inv of invNums ?? []) {
      invoiceMap[inv.order_id] = inv.invoice_number
      if (inv.order_id) orderIdMap[inv.order_id] = inv.order_id
    }
  }

  // ✅ Also fetch invoice_number from orders table as backup
  if (invoiceIds.length > 0) {
    const { data: ordersWithInv } = await supabase
      .from('orders')
      .select('id, invoice_number')
      .in('id', invoiceIds)
    for (const o of ordersWithInv ?? []) {
      if (o.invoice_number && !invoiceMap[o.id]) {
        invoiceMap[o.id] = o.invoice_number
      }
    }
  }

  type LedgerEntry = {
    id: string
    date: string
    type: 'invoice' | 'payment' | 'credit'
    description: string
    debit: number
    credit: number
    balance: number
    amount_paid: number
    outstanding: number
    paid_status: 'paid' | 'partial' | 'unpaid' | 'void' | 'na'
    due_date: string | null
    invoice_id: string | null
    order_id: string | null
  }

  const entries: LedgerEntry[] = []

  // ── AR Transactions ───────────────────────────────────────────────────
  for (const tx of arTxRaw ?? []) {
    const isCredit   = tx.type === 'credit'
    const txAmount   = Number(tx.amount      || 0)
    const amtPaid    = Number(tx.amount_paid || 0)
    const invoiceNum = tx.invoice_id ? invoiceMap[tx.invoice_id] : null

    // ✅ Build description: prefer real invoice number over generic text
    const rawDesc = tx.description || ''
    const isGeneric =
      rawDesc.toLowerCase().includes('edited') ||
      rawDesc.toLowerCase().startsWith('invoice -') ||
      rawDesc.toLowerCase().startsWith('credit invoice') ||
      !rawDesc.match(/#\s*\d+/)

    let finalDescription: string
    if (invoiceNum) {
      const invStr  = `Invoice #${String(invoiceNum).padStart(6, '0')}`
      const suffix  = rawDesc.toLowerCase().includes('edited')
                        ? ' (edited)'
                        : isCredit
                          ? ' (credit)'
                          : ''
      const customer = rawDesc.includes(' - ')
                        ? ' - ' + rawDesc.split(' - ').slice(1).join(' - ')
                        : ''
      finalDescription = isGeneric
        ? invStr + suffix + customer
        : rawDesc
    } else {
      finalDescription = rawDesc || (isCredit ? 'Credit' : 'Invoice')
    }

    // ✅ Detect voided/zeroed invoices
    const isVoided = !isCredit && Math.abs(txAmount) < 0.01

    const paidStatus: 'paid' | 'partial' | 'unpaid' | 'void' | 'na' = isCredit
      ? 'na'
      : isVoided
        ? 'void'
        : amtPaid >= txAmount - 0.01
          ? 'paid'
          : amtPaid > 0
            ? 'partial'
            : 'unpaid'

    entries.push({
      id:          tx.id,
      date:        tx.created_at,
      type:        isCredit ? 'credit' : 'invoice',
      description: finalDescription,
      debit:       txAmount,
      credit:      isCredit ? txAmount : 0,
      balance:     0,
      amount_paid: amtPaid,
      outstanding: Math.max(txAmount - amtPaid, 0),
      paid_status: paidStatus,
      due_date:    tx.due_date || null,
      invoice_id:  tx.invoice_id || null,
      order_id:    tx.invoice_id ? (orderIdMap[tx.invoice_id] ?? null) : null,
    })
  }

  // ── Payments ──────────────────────────────────────────────────────────
  for (const pmt of pmtRaw ?? []) {
    const method = (pmt.payment_method ?? '').replace(/_/g, ' ') || 'payment'
    const ref    = pmt.reference_number ? ' - ' + pmt.reference_number : ''
    entries.push({
      id:          pmt.id,
      date:        pmt.payment_date + 'T12:00:00',
      type:        'payment',
      description: 'Payment received (' + method + ')' + ref,
      debit:       0,
      credit:      Number(pmt.amount),
      balance:     0,
      amount_paid: 0,
      outstanding: 0,
      paid_status: 'na',
      due_date:    null,
      invoice_id:  null,
      order_id:    null,
    })
  }

  // ── Sort + running balance ────────────────────────────────────────────
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let running = 0
  for (const e of entries) {
    if (e.type === 'invoice') {
      running += e.debit
    } else if (e.type === 'credit') {
      running -= e.debit
    } else if (e.type === 'payment') {
      running -= e.credit
    }
    e.balance = Math.round(running * 100) / 100
  }

  const totalInvoiced = entries
    .filter(e => e.type === 'invoice')
    .reduce((s, e) => s + e.debit, 0)

  const totalPaid = (pmtRaw ?? [])
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalCredits = entries
    .filter(e => e.type === 'credit')
    .reduce((s, e) => s + e.credit, 0)

  return {
    customer,
    entries:        [...entries].reverse(),
    totalInvoiced,
    totalPaid,
    totalCredits,
    currentBalance: Math.round(running * 100) / 100,
  }
}

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ customer_id: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { customer_id } = await params
  const data = await getCustomerLedger(customer_id)

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold">Customer not found</p>
          <Link href="/admin/ar" className="mt-4 inline-block text-red-600 hover:underline">
            Back to AR
          </Link>
        </div>
      </div>
    )
  }

  const { customer, entries, totalInvoiced, totalPaid, totalCredits, currentBalance } = data

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link
        href="/admin/ar"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to AR
      </Link>

      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#006A4E' }}>
              {customer.business_name || customer.contact_name}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{customer.email}</p>
            {customer.address && (
              <p className="text-gray-400 text-xs mt-1">{customer.address}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Current Balance</p>
            <p
              className="text-3xl font-bold"
              style={{ color: currentBalance > 0 ? '#CE1126' : '#006A4E' }}
            >
              {formatCurrency(Math.abs(currentBalance))}
            </p>
            {currentBalance < 0 && (
              <p className="text-xs text-green-600 mt-1">Credit balance</p>
            )}
            {currentBalance === 0 && (
              <p className="text-xs text-green-600 mt-1">Account clear</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-5">
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-500">Total Invoiced</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalInvoiced)}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-500">Total Paid</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-xs text-orange-500">Credits Applied</p>
            <p className="text-lg font-bold text-orange-700">{formatCurrency(totalCredits)}</p>
          </div>
          <div
            className="p-3 rounded-lg border"
            style={{ backgroundColor: currentBalance > 0 ? '#fef2f2' : '#f0fdf4' }}
          >
            <p className="text-xs text-gray-500">Balance Due</p>
            <p
              className="text-lg font-bold"
              style={{ color: currentBalance > 0 ? '#CE1126' : '#006A4E' }}
            >
              {formatCurrency(currentBalance)}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <StatementActions customer={customer} />
      </div>

      <TabView
        customerId={customer_id}
        customer={customer}
        entries={entries}
        currentBalance={currentBalance}
      />
    </div>
  )
}