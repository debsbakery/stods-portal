'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  DollarSign,
  FileText,
  MinusCircle,
  Plus,
  Loader2,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface LedgerEntry {
  id: string
  date: string
  type: 'invoice' | 'payment' | 'credit'
  description: string
  debit: number
  credit: number
  balance: number
  amount_paid: number
  outstanding: number
  paid_status: 'paid' | 'partial' | 'unpaid' | 'na'
  due_date: string | null
}

interface Props {
  customerId: string
  customer: any
  entries: LedgerEntry[]
  currentBalance: number
}

function formatAusDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return [
    d.getDate().toString().padStart(2, '0'),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getFullYear(),
  ].join('/')
}

export default function CustomerLedgerClient({
  customerId,
  customer,
  entries,
  currentBalance,
}: Props) {
  const router = useRouter()

  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount]     = useState('')
  const [payDate, setPayDate]         = useState(
    new Date().toISOString().split('T')[0]
  )
  const [payMethod, setPayMethod]     = useState('bank_transfer')
  const [payRef, setPayRef]           = useState('')
  const [payNotes, setPayNotes]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const handleRecordPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:      customerId,
          amount:           parseFloat(payAmount),
          payment_date:     payDate,
          payment_method:   payMethod,
          reference_number: payRef   || null,
          notes:            payNotes || null,
          allocations:      [],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to record payment')
      setShowPayment(false)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Transaction Ledger
          <span className="ml-2 text-sm font-normal text-gray-400">
            {entries.length} transactions
          </span>
        </h2>
        {currentBalance > 0 && (
          <button
            onClick={() => setShowPayment(true)}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
            style={{ backgroundColor: '#006A4E' }}
          >
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Charges</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Payments</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                entries.map((entry, i) => (
                  <tr
                    key={`${entry.id}-${i}`}
                    className={
                      entry.type === 'payment' ? 'bg-green-50 hover:bg-green-100' :
                      entry.type === 'credit'  ? 'bg-orange-50 hover:bg-orange-100' :
                      'hover:bg-gray-50'
                    }
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatAusDate(entry.date)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.type === 'invoice' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                          <FileText className="h-3 w-3" /> Invoice
                        </span>
                      )}
                      {entry.type === 'payment' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <DollarSign className="h-3 w-3" /> Payment
                        </span>
                      )}
                      {entry.type === 'credit' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          <MinusCircle className="h-3 w-3" /> Credit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {entry.type === 'invoice' && (
                        <>
                          {entry.paid_status === 'paid' && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              PAID
                            </span>
                          )}
                          {entry.paid_status === 'partial' && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium whitespace-nowrap">
                              PART ${entry.amount_paid.toFixed(2)}
                            </span>
                          )}
                          {entry.paid_status === 'unpaid' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              UNPAID
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-mono font-semibold"
                      style={{ color: entry.balance > 0 ? '#CE1126' : '#006A4E' }}
                    >
                      {formatCurrency(entry.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {customer.business_name || customer.contact_name}
                  {' · '}Balance: {formatCurrency(currentBalance)}
                </p>
              </div>
              <button
                onClick={() => { setShowPayment(false); setError('') }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <span className="px-3 py-2 bg-gray-50 text-gray-500 border-r font-medium">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={currentBalance.toFixed(2)}
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm focus:outline-none"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => setPayAmount(currentBalance.toFixed(2))}
                  className="text-xs text-green-700 mt-1 hover:underline"
                >
                  Pay full balance ({formatCurrency(currentBalance)})
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. BSB/Acc or cheque number"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes..."
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => { setShowPayment(false); setError('') }}
                className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={saving}
                className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: '#006A4E' }}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><DollarSign className="h-4 w-4" /> Record Payment</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
