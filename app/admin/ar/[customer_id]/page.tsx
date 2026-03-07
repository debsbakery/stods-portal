export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import StatementActions from '@/components/ar/StatementActions'
import CustomerLedgerClient from './customer-ledger-client'

function formatAusDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d   = new Date(dateStr)
    const day = d.getDate().toString().padStart(2, '0')
    const mon = (d.getMonth() + 1).toString().padStart(2, '0')
    return `${day}/${mon}/${d.getFullYear()}`
  } catch { return dateStr }
}

async function getCustomerLedger(customerId: string) {
  const supabase = createAdminClient()

  // ── Customer ──────────────────────────────────────────────
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (!customer) return null

  // ── AR transactions (invoices + credits) ──────────────────
  const { data: arTx } = await supabase
    .from('ar_transactions')
    .select('id, type, amount, description, created_at, invoice_id')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })

  // ── Payments ──────────────────────────────────────────────
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, payment_date, payment_method, reference_number, notes')
    .eq('customer_id', customerId)
    .order('payment_date', { ascending: true })

  // ── Credit memos ──────────────────────────────────────────
  const { data: creditMemos } = await supabase
    .from('credit_memos')
    .select('id, credit_number, credit_date, total_amount, amount, credit_type, created_at')
    .eq('customer_id', customerId)
    .order('credit_date', { ascending: true })

  // ── Invoice number map ────────────────────────────────────
  const invoiceIds = (arTx ?? [])
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

  // ── Build unified ledger ──────────────────────────────────
  type LedgerEntry = {
    id: string
    date: string
    type: 'invoice' | 'payment' | 'credit'
    description: string
    debit: number
    credit: number
    balance: number
  }

  const entries: LedgerEntry[] = []

  // AR transactions → invoices + credits
  for (const tx of arTx ?? []) {
    const isCredit   = tx.type === 'credit'
    const invoiceNum = tx.invoice_id ? invoiceMap[tx.invoice_id] : null
    const reference  = invoiceNum
      ? `INV-${String(invoiceNum).padStart(4, '0')}`
      : tx.type.toUpperCase()

    entries.push({
      id:          tx.id,
      date:        tx.created_at,
      type:        isCredit ? 'credit' : 'invoice',
      description: tx.description || reference,
      debit:       isCredit ? 0 : Number(tx.amount),
      credit:      isCredit ? Number(tx.amount) : 0,
      balance:     0,
    })
  }

  // Payments
  for (const pmt of payments ?? []) {
    const method = pmt.payment_method?.replace(/_/g, ' ') || 'payment'
    entries.push({
      id:          pmt.id,
      date:        pmt.payment_date + 'T12:00:00',
      type:        'payment',
      description: `Payment received (${method})${pmt.reference_number ? ` — ${pmt.reference_number}` : ''}`,
      debit:       0,
      credit:      Number(pmt.amount),
      balance:     0,
    })
  }

  // Credit memos
  for (const cm of creditMemos ?? []) {
    const cmAmount = Math.abs(Number(cm.total_amount || cm.amount || 0))
    entries.push({
      id:          cm.id,
      date:        cm.credit_date || cm.created_at,
      type:        'credit',
      description: `Credit ${cm.credit_number || ''} — ${
        cm.credit_type === 'stale_return' ? 'Stale Return' : 'Product Credit'
      }`,
      debit:       0,
      credit:      cmAmount,
      balance:     0,
    })
  }

  // Sort oldest → newest, calculate running balance
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let running = 0
  for (const e of entries) {
    running += e.debit - e.credit
    e.balance = Math.round(running * 100) / 100
  }

  // Totals
  const totalInvoiced = entries
    .filter(e => e.type === 'invoice')
    .reduce((s, e) => s + e.debit, 0)

  const totalPaid = (payments ?? [])
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalCredits = entries
    .filter(e => e.type === 'credit')
    .reduce((s, e) => s + e.credit, 0)

  return {
    customer,
    entries:        [...entries].reverse(), // newest first for display
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

      {/* Back */}
      <Link
        href="/admin/ar"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to AR
      </Link>

      {/* Customer header */}
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

        {/* Summary cards */}
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
          <div className="p-3 rounded-lg border"
            style={{ backgroundColor: currentBalance > 0 ? '#fef2f2' : '#f0fdf4' }}>
            <p className="text-xs text-gray-500">Balance Due</p>
            <p className="text-lg font-bold"
              style={{ color: currentBalance > 0 ? '#CE1126' : '#006A4E' }}>
              {formatCurrency(currentBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Statement actions (existing component) */}
      <div className="mb-6">
        <StatementActions customer={customer} />
      </div>

      {/* Client component handles Record Payment modal + ledger table */}
      <CustomerLedgerClient
        customerId={customer_id}
        customer={customer}
        entries={entries}
        currentBalance={currentBalance}
      />

    </div>
  )
}