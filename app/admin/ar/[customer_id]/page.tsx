export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { checkAdmin } from "@/lib/auth"
import { ArrowLeft, DollarSign, FileText } from "lucide-react"
import Link from "next/link"
// ✅ Australian date format helper
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
async function getCustomerLedger(customerId: string) {
  const supabase = await createClient()

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (!customer) return null

  // ✅ Get invoices from orders table
  const { data: invoices } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('delivery_date', { ascending: false })

  // ✅ Get payments from payments table (NOT ar_transactions!)
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('customer_id', customerId)
    .order('payment_date', { ascending: false })

  console.log(`✅ Ledger data for ${customer.business_name}:`, {
    invoices: invoices?.length || 0,
    payments: payments?.length || 0
  })

  // ✅ Calculate actual balance
  const calculatedBalance = (invoices || []).reduce((sum, inv) => {
    return sum + (inv.total_amount - (inv.amount_paid || 0))
  }, 0)

  return { customer, invoices: invoices || [], payments: payments || [], calculatedBalance }
}

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ customer_id: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect("/")

  const { customer_id } = await params
  const ledgerData = await getCustomerLedger(customer_id)

  if (!ledgerData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold text-lg">Customer not found</p>
          <Link href="/admin/ar" className="inline-block mt-4 text-red-600 hover:underline">
            ← Back to AR
          </Link>
        </div>
      </div>
    )
  }

  const { customer, invoices, payments, calculatedBalance } = ledgerData

  // ✅ Combine invoices and payments into one ledger
  const ledgerEntries = [
    ...invoices.map((inv: any) => ({
      date: inv.delivery_date,
      type: 'invoice',
      description: `Invoice - ${new Date(inv.delivery_date).toLocaleDateString()}`,
      invoiceId: inv.id,
      debit: inv.total_amount,
      credit: 0,
      balance: 0,
    })),
    ...payments.map((pay: any) => ({
      date: pay.payment_date,
      type: 'payment',
      description: `Payment - ${pay.payment_method} ${pay.reference_number || ''}`,
      paymentId: pay.id,
      debit: 0,
      credit: pay.amount,
      balance: 0,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // ✅ Calculate running balance
  let runningBalance = 0
  ledgerEntries.forEach((entry) => {
    runningBalance += entry.debit - entry.credit
    entry.balance = runningBalance
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href="/admin/ar" className="flex items-center gap-1 text-sm mb-4 hover:opacity-80" style={{ color: "#CE1126" }}>
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
            <p className="text-sm text-gray-600">Calculated Balance</p>
            <p className="text-3xl font-bold" style={{ color: runningBalance > 0 ? "#CE1126" : "#006A4E" }}>
              {formatCurrency(Math.abs(runningBalance))}
            </p>
            {Math.abs(customer.balance - calculatedBalance) > 0.01 && (
  <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
    <p className="text-xs text-orange-700 mb-1">
      ⚠️ Stored balance ({formatCurrency(customer.balance)}) differs from calculated ({formatCurrency(calculatedBalance)})
    </p>
    <form action={`/api/admin/ar/sync-balance`} method="POST" className="inline">
      <input type="hidden" name="customer_id" value={customer.id} />
      <button
        type="submit"
        className="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700"
      >
        Sync Balance Now
      </button>
    </form>
  </div>
)}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="p-3 bg-red-50 rounded border border-red-200">
            <p className="text-xs text-red-600">Total Invoiced</p>
            <p className="text-lg font-bold text-red-800">
              {formatCurrency(invoices.reduce((sum, inv) => sum + inv.total_amount, 0))}
            </p>
          </div>
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <p className="text-xs text-green-600">Total Paid</p>
            <p className="text-lg font-bold text-green-800">
              {formatCurrency(payments.reduce((sum, pay) => sum + pay.amount, 0))}
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-xs text-blue-600">Balance Due</p>
            <p className="text-lg font-bold text-blue-800">
              {formatCurrency(calculatedBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Transaction Ledger</h2>
          <p className="text-sm text-gray-600">{invoices.length} invoices, {payments.length} payments</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Charges</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Payments</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry, index) => (
                  <tr key={index} className={entry.type === 'payment' ? 'bg-green-50' : ''}>
                    <td className="px-4 py-3 text-sm">
                     {formatAusDate(entry.date)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.type === 'invoice' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          <FileText className="h-3 w-3" />
                          Invoice
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <DollarSign className="h-3 w-3" />
                          Payment
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {entry.description}
                    </td>
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
                <td colSpan={3} className="px-4 py-3 text-right font-bold">Totals:</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  {formatCurrency(invoices.reduce((sum, inv) => sum + inv.total_amount, 0))}
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-600">
                  {formatCurrency(payments.reduce((sum, pay) => sum + pay.amount, 0))}
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