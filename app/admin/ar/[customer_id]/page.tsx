export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { checkAdmin } from "@/lib/auth"
import { ArrowLeft, DollarSign, FileText, MinusCircle } from "lucide-react"
import Link from "next/link"
import StatementActions from "@/components/ar/StatementActions"

function formatAusDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return dateStr
  }
}

async function getCustomerLedger(customerId: string, startDate?: string, endDate?: string) {
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (!customer) return null

  const end   = endDate   || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 3))
    .toISOString().split('T')[0]

  const [
    { data: invoices },
    { data: payments },
    { data: creditMemos },
  ] = await Promise.all([
    supabase.from('orders').select('*')
      .eq('customer_id', customerId)
      .gte('delivery_date', start)
      .lte('delivery_date', end)
      .order('delivery_date', { ascending: false }),
    supabase.from('payments').select('*')
      .eq('customer_id', customerId)
      .gte('payment_date', start)
      .lte('payment_date', end)
      .order('payment_date', { ascending: false }),
    supabase.from('credit_memos').select('*')
      .eq('customer_id', customerId)
      .gte('credit_date', start)
      .lte('credit_date', end)
      .order('credit_date', { ascending: false }),
  ])

  // All-time totals for summary cards
  const [
    { data: allInvoices },
    { data: allPayments },
    { data: allCredits },
  ] = await Promise.all([
    supabase.from('orders').select('total_amount, amount_paid').eq('customer_id', customerId),
    supabase.from('payments').select('amount').eq('customer_id', customerId),
    supabase.from('credit_memos').select('total_amount, amount').eq('customer_id', customerId),
  ])

  const calculatedBalance =
    (allInvoices || []).reduce((s, i) => s + parseFloat(i.total_amount || '0'), 0) -
    (allPayments || []).reduce((s, p) => s + parseFloat(p.amount || '0'), 0) -
    (allCredits  || []).reduce((s, c) => s + Math.abs(parseFloat(c.total_amount || c.amount || '0')), 0)

  return {
    customer,
    invoices:    invoices    || [],
    payments:    payments    || [],
    creditMemos: creditMemos || [],
    calculatedBalance,
    startDate: start,
    endDate:   end,
  }
}

export default async function CustomerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customer_id: string }>
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { customer_id } = await params
  const { start, end }  = await searchParams

  const ledgerData = await getCustomerLedger(customer_id, start, end)

  if (!ledgerData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold text-lg">Customer not found</p>
          <Link href="/admin/ar" className="inline-block mt-4 text-red-600 hover:underline">
            Back to AR
          </Link>
        </div>
      </div>
    )
  }

  const { customer, invoices, payments, creditMemos, calculatedBalance, startDate, endDate } = ledgerData

  // Build combined ledger — sort oldest first for running balance calc
  const ledgerEntriesAsc = [
    ...invoices.map((inv: any) => ({
      date:        inv.delivery_date,
      type:        'invoice',
      description: `Invoice - ${formatAusDate(inv.delivery_date)}${inv.invoice_number ? ` #${inv.invoice_number}` : ''}`,
      debit:       parseFloat(inv.total_amount || '0'),
      credit:      0,
      balance:     0,
    })),
    ...payments.map((pay: any) => ({
      date:        pay.payment_date,
      type:        'payment',
      description: `Payment - ${pay.payment_method}${pay.reference_number ? ` (${pay.reference_number})` : ''}`,
      debit:       0,
      credit:      parseFloat(pay.amount || '0'),
      balance:     0,
    })),
    ...creditMemos.map((cm: any) => ({
      date:        cm.credit_date || cm.created_at,
      type:        'credit',
      description: `Credit ${cm.credit_number} - ${cm.credit_type === 'stale_return' ? 'Stale Return' : 'Product Credit'}`,
      debit:       0,
      credit:      Math.abs(parseFloat(cm.total_amount || cm.amount || '0')),
      balance:     0,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate running balance oldest→newest
  let runningBalance = 0
  ledgerEntriesAsc.forEach(entry => {
    runningBalance += entry.debit - entry.credit
    entry.balance = runningBalance
  })

  // Display newest first
  const ledgerEntries = [...ledgerEntriesAsc].reverse()

  const totalInvoiced = invoices.reduce((s: number, inv: any) => s + parseFloat(inv.total_amount || '0'), 0)
  const totalPaid     = payments.reduce((s: number, pay: any) => s + parseFloat(pay.amount || '0'), 0)
  const totalCredits  = creditMemos.reduce((s: number, cm: any) => s + Math.abs(parseFloat(cm.total_amount || cm.amount || '0')), 0)

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/admin/ar"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to AR
      </Link>

      {/* Customer Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#006A4E" }}>
              {customer.business_name || customer.contact_name}
            </h1>
            <p className="text-gray-600">{customer.email}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Current Balance (all time)</p>
            <p className="text-3xl font-bold" style={{ color: calculatedBalance > 0 ? "#CE1126" : "#006A4E" }}>
              {formatCurrency(Math.abs(calculatedBalance))}
            </p>
            {Math.abs(customer.balance - calculatedBalance) > 0.01 && (
              <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                <p className="text-xs text-orange-700 mb-1">
                  Stored balance ({formatCurrency(customer.balance)}) differs from calculated ({formatCurrency(calculatedBalance)})
                </p>
                <form action="/api/admin/ar/sync-balance" method="POST" className="inline">
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <button
                    type="submit"
                    className="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    Sync Balance
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Summary Cards — all time */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-red-50 rounded border border-red-200">
            <p className="text-xs text-red-600">Total Invoiced</p>
            <p className="text-lg font-bold text-red-800">{formatCurrency(totalInvoiced)}</p>
          </div>
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <p className="text-xs text-green-600">Total Paid</p>
            <p className="text-lg font-bold text-green-800">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded border border-orange-200">
            <p className="text-xs text-orange-600">Total Credits</p>
            <p className="text-lg font-bold text-orange-800">{formatCurrency(totalCredits)}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-xs text-blue-600">Balance Due</p>
            <p className="text-lg font-bold text-blue-800">{formatCurrency(calculatedBalance)}</p>
          </div>
        </div>
      </div>

      {/* Statement Actions */}
      <div className="mb-6">
        <StatementActions customer={customer} />
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <form method="GET" className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Filter period:</span>
          <input
            type="date"
            name="start"
            defaultValue={startDate}
            className="border rounded px-3 py-1.5 text-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            name="end"
            defaultValue={endDate}
            className="border rounded px-3 py-1.5 text-sm"
          /><button
            type="submit"
            className="px-4 py-1.5 text-white text-sm rounded hover:opacity-90"
            style={{ backgroundColor: '#006A4E' }}
          >
            Apply
          </button>
          <Link
            href={`/admin/ar/${customer_id}`}
            className="px-4 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50"
          >
            Reset
          </Link>
          <span className="text-xs text-gray-400 ml-auto">
            {ledgerEntries.length} transactions in period
          </span>
        </form>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Transaction Ledger</h2>
          <p className="text-sm text-gray-600">
            {invoices.length} invoices · {payments.length} payments · {creditMemos.length} credits
            <span className="ml-2 text-gray-400">
              ({formatAusDate(startDate)} – {formatAusDate(endDate)})
            </span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Charges</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credits/Payments</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No transactions in this period
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry, index) => (
                  <tr
                    key={index}
                    className={
                      entry.type === 'payment' ? 'bg-green-50' :
                      entry.type === 'credit'  ? 'bg-orange-50' : ''
                    }
                  >
                    <td className="px-4 py-3 text-sm">{formatAusDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      {entry.type === 'invoice' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          <FileText className="h-3 w-3" /> Invoice
                        </span>
                      )}
                      {entry.type === 'payment' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <DollarSign className="h-3 w-3" /> Payment
                        </span>
                      )}
                      {entry.type === 'credit' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          <MinusCircle className="h-3 w-3" /> Credit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.description}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold">
                      {formatCurrency(entry.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-bold">Period Totals:</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  {formatCurrency(totalInvoiced)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-600">
                  {formatCurrency(totalPaid + totalCredits)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg">
                  {formatCurrency(runningBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}