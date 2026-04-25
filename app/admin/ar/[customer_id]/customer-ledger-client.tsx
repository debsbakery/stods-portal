'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  DollarSign, FileText, MinusCircle,
  Plus, Loader2, X, AlertCircle,
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
  paid_status: 'paid' | 'partial' | 'unpaid' | 'void' | 'na'
  due_date: string | null
  invoice_id: string | null
  order_id: string | null
}

interface Props {
  customerId: string
  customer: any
  entries: LedgerEntry[]
  currentBalance: number
}

function formatAusDate(dateStr: string): string {
  if (!dateStr) return '-'
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

  const [showPayment,    setShowPayment]    = useState(false)
  const [payAmount,      setPayAmount]      = useState('')
  const [payDate,        setPayDate]        = useState(new Date().toISOString().split('T')[0])
  const [payMethod,      setPayMethod]      = useState('bank_transfer')
  const [payRef,         setPayRef]         = useState('')
  const [payNotes,       setPayNotes]       = useState('')
  const [allocMode,      setAllocMode]      = useState<'fifo' | 'manual'>('fifo')
  const [manualAlloc,    setManualAlloc]    = useState<Record<string, string>>({})
  const [saving,         setSaving]         = useState(false)
  const [applyingCredit, setApplyingCredit] = useState<string | null>(null)
  const [error,          setError]          = useState('')

  // ── Unpaid invoices (excluding void)
  const unpaidInvoices = entries.filter(
    e => e.type === 'invoice' && e.paid_status !== 'paid' && e.paid_status !== 'void'
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // ── Unapplied credits
  const unappliedCredits = entries.filter(
    e => e.type === 'credit' && Number(e.amount_paid) === 0
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // ── Combined list
  const allocatableItems = [
    ...unpaidInvoices.map(e => ({ ...e, isCredit: false })),
    ...unappliedCredits.map(e => ({ ...e, isCredit: true })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const unusedCredits = unappliedCredits

  // ── Count void invoices for info banner
  const voidCount = entries.filter(
    e => e.type === 'invoice' && e.paid_status === 'void'
  ).length

  function buildFifoAllocations(amount: number) {
    const allocs: { invoice_id: string; amount: number; is_credit?: boolean }[] = []
    let remaining = amount

    for (const item of allocatableItems) {
      if (remaining <= 0) break

      if (item.isCredit) {
        const creditAmt = item.debit
        allocs.push({
          invoice_id: item.id,
          amount:     -creditAmt,
          is_credit:  true,
        })
        remaining -= creditAmt
      } else {
        const allocId = item.order_id ?? item.invoice_id
        if (!allocId) continue
        const outstanding = item.debit - item.amount_paid
        const applying    = Math.min(remaining, outstanding)
        if (applying > 0) {
          allocs.push({ invoice_id: allocId, amount: Math.round(applying * 100) / 100 })
          remaining -= applying
        }
      }
    }
    return allocs
  }

  function buildManualAllocations() {
    const allocs: { invoice_id: string; amount: number; is_credit?: boolean }[] = []
    for (const [id, amtStr] of Object.entries(manualAlloc)) {
      const amt = parseFloat(amtStr)
      if (amt !== 0 && id) {
        allocs.push({
          invoice_id: id,
          amount:     Math.round(amt * 100) / 100,
          is_credit:  amt < 0,
        })
      }
    }
    return allocs
  }

  async function handleApplyCredit(creditEntry: LedgerEntry) {
    if (!confirm(
      `Apply credit of ${formatCurrency(creditEntry.debit)} to ${customer.business_name || customer.contact_name}?\n\nThis will mark the credit as used and reduce the outstanding balance.`
    )) return

    setApplyingCredit(creditEntry.id)
    try {
      const res = await fetch('/api/admin/ar/apply-credit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          credit_id:   creditEntry.id,
          amount:      creditEntry.debit,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to apply credit')
      router.refresh()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setApplyingCredit(null)
    }
  }

  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount)
    if (!payAmount || amount === 0) {
      setError('Please enter a valid amount')
      return
    }
    setError('')
    setSaving(true)

    try {
      const allocations = allocMode === 'fifo'
        ? buildFifoAllocations(amount)
        : buildManualAllocations()

      const res = await fetch('/api/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:      customerId,
          amount,
          payment_date:     payDate,
          payment_method:   payMethod,
          reference_number: payRef   || null,
          notes:            payNotes || null,
          allocations,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to record payment')

      setShowPayment(false)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      setManualAlloc({})
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function closeModal() {
    setShowPayment(false)
    setError('')
    setManualAlloc({})
  }

  const payAmountNum = parseFloat(payAmount) || 0
  const fifoPreview  = allocMode === 'fifo' ? buildFifoAllocations(payAmountNum) : []
  const manualTotal  = Object.values(manualAlloc).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  return (
    <>
      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Transaction Ledger
          <span className="ml-2 text-sm font-normal text-gray-400">
            {entries.length} transactions
          </span>
        </h2>
        <button
          onClick={() => setShowPayment(true)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ backgroundColor: '#006A4E' }}
        >
          <Plus className="h-4 w-4" /> Record Payment
        </button>
      </div>

      {/* ── Overdue alert ── */}
      {unpaidInvoices.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{unpaidInvoices.length}</strong> invoice{unpaidInvoices.length !== 1 ? 's' : ''} outstanding
            totalling <strong>{formatCurrency(unpaidInvoices.reduce((s, e) => s + (e.debit - e.amount_paid), 0))}</strong>
          </span>
        </div>
      )}

      {/* ── Unused credits banner ── */}
      {unusedCredits.length > 0 && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2 text-sm text-orange-800">
          <MinusCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{unusedCredits.length}</strong> unapplied credit{unusedCredits.length !== 1 ? 's' : ''}
            totalling <strong>{formatCurrency(unusedCredits.reduce((s, e) => s + e.debit, 0))}</strong> —
            use <strong>Record Payment</strong> to assign them, or click <strong>✓ Apply</strong> on a credit row to apply directly
          </span>
        </div>
      )}

      {/* ── ✅ Void invoices banner ── */}
      {voidCount > 0 && (
        <div className="mb-4 p-3 bg-gray-100 border border-gray-300 rounded-lg flex items-center gap-2 text-sm text-gray-700">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <strong>{voidCount}</strong> voided/corrected invoice{voidCount !== 1 ? 's' : ''} on file
            (shown in grey, $0.00 — no impact on balance)
          </span>
        </div>
      )}

      {/* ── Ledger table ── */}
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
                entries.map((entry, i) => {
                  const isVoid = entry.paid_status === 'void'
                  return (
                    <tr
                      key={entry.id + '-' + i}
                      className={
                        isVoid                    ? 'bg-gray-100 hover:bg-gray-200 opacity-75' :
                        entry.type === 'payment'  ? 'bg-green-50 hover:bg-green-100' :
                        entry.type === 'credit'   ? 'bg-orange-50 hover:bg-orange-100' :
                        'hover:bg-gray-50'
                      }
                    >
                      <td className={`px-4 py-3 whitespace-nowrap ${isVoid ? 'text-gray-500' : 'text-gray-600'}`}>
                        {formatAusDate(entry.date)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.type === 'invoice' && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isVoid ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-700'
                          }`}>
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
                      <td className={`px-4 py-3 max-w-xs ${isVoid ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                        <div className="flex items-center gap-2">
                          <span className="truncate">{entry.description}</span>
                          {entry.type === 'credit' && Number(entry.amount_paid) === 0 && (
                            <button
                              onClick={() => handleApplyCredit(entry)}
                              disabled={applyingCredit === entry.id}
                              className="shrink-0 px-2 py-0.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              {applyingCredit === entry.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : '✓ Apply'
                              }
                            </button>
                          )}
                          {entry.type === 'credit' && Number(entry.amount_paid) > 0 && (
                            <span className="shrink-0 px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                              Applied
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {entry.type === 'invoice' && (
                          <>
                            {entry.paid_status === 'void' && (
                              <span
                                className="px-2 py-0.5 bg-gray-300 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap"
                                title="Invoice corrected to $0 — voided"
                              >
                                ⚠️ VOID
                              </span>
                            )}
                            {entry.paid_status === 'paid' && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">PAID</span>
                            )}
                            {entry.paid_status === 'partial' && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium whitespace-nowrap">
                                PART {formatCurrency(entry.amount_paid)}
                              </span>
                            )}
                            {entry.paid_status === 'unpaid' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">UNPAID</span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Charges column — credits show as negative */}
                      <td className="px-4 py-3 text-right font-mono">
                        {entry.type === 'credit' ? (
                          <span className="text-orange-600 font-semibold">
                            -{formatCurrency(entry.debit)}
                          </span>
                        ) : entry.debit > 0 ? (
                          <span className="text-red-600">{formatCurrency(entry.debit)}</span>
                        ) : isVoid ? (
                          <span className="text-gray-400">$0.00</span>
                        ) : '-'}
                      </td>

                      {/* Payments column */}
                      <td className="px-4 py-3 text-right font-mono text-green-600">
                        {entry.type === 'payment' && entry.credit > 0
                          ? formatCurrency(entry.credit)
                          : '-'}
                      </td>

                      <td
                        className="px-4 py-3 text-right font-mono font-semibold"
                        style={{ color: entry.balance > 0 ? '#CE1126' : '#006A4E' }}
                      >
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAYMENT MODAL ── */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {customer.business_name || customer.contact_name}
                  {' · '}Balance: {formatCurrency(currentBalance)}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {error}
                </div>
              )}

              {unusedCredits.length > 0 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                  <p className="font-semibold mb-1">💡 Unapplied Credits Available</p>
                  <p className="text-xs">
                    {unusedCredits.length} credit{unusedCredits.length !== 1 ? 's' : ''} totalling{' '}
                    <strong>{formatCurrency(unusedCredits.reduce((s, e) => s + e.debit, 0))}</strong> will
                    appear in the allocation list below — include them to reduce the cash payment needed.
                  </p>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Received{' '}
                  <span className="text-gray-400 font-normal text-xs">(use negative to reverse)</span>{' '}
                  <span className="text-red-500">*</span>
                </label>
                <div className={`flex items-center border rounded-lg overflow-hidden ${
                  payAmountNum < 0 ? 'border-red-400 bg-red-50' : ''
                }`}>
                  <span className={`px-3 py-2 border-r font-medium ${
                    payAmountNum < 0 ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-500'
                  }`}>$</span>
                  <input
                    type="number"
                    min="-999999"
                    step="0.01"
                    placeholder={currentBalance.toFixed(2)}
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className={`flex-1 px-3 py-2 text-sm focus:outline-none ${
                      payAmountNum < 0 ? 'bg-red-50 text-red-700' : ''
                    }`}
                    autoFocus
                  />
                </div>
                {payAmountNum < 0 && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-1">
                    <span>↩️</span>
                    <span>
                      <strong>Reversal:</strong> adds{' '}
                      <strong>${Math.abs(payAmountNum).toFixed(2)}</strong> back to balance
                    </span>
                  </div>
                )}
                {payAmountNum >= 0 && (
                  <button
                    onClick={() => setPayAmount(currentBalance.toFixed(2))}
                    className="text-xs text-green-700 mt-1 hover:underline"
                  >
                    Pay full balance ({formatCurrency(currentBalance)})
                  </button>
                )}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. BSB/Acc or cheque number"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Allocation */}
              {allocatableItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apply To Invoices &amp; Credits
                  </label>

                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setAllocMode('fifo')}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        allocMode === 'fifo'
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
                      }`}
                    >
                      Auto (oldest first)
                    </button>
                    <button
                      onClick={() => setAllocMode('manual')}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        allocMode === 'manual'
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
                      }`}
                    >
                      Manual selection
                    </button>
                  </div>

                  {allocMode === 'fifo' && payAmountNum > 0 && (
                    <div className="space-y-1">
                      {fifoPreview.length === 0 ? (
                        <p className="text-xs text-gray-400">Enter an amount above to preview allocation</p>
                      ) : (
                        fifoPreview.map((a, idx) => {
                          const isCredit = a.is_credit
                          const item = isCredit
                            ? unappliedCredits.find(e => e.id === a.invoice_id)
                            : unpaidInvoices.find(e => e.order_id === a.invoice_id || e.invoice_id === a.invoice_id)
                          return (
                            <div
                              key={a.invoice_id + idx}
                              className={`flex justify-between items-center p-2 rounded text-xs ${
                                isCredit ? 'bg-orange-50' : 'bg-green-50'
                              }`}
                            >
                              <span className="text-gray-700 flex items-center gap-1">
                                {isCredit && (
                                  <span className="px-1 py-0.5 bg-orange-100 text-orange-600 rounded text-[10px] font-semibold">
                                    CREDIT
                                  </span>
                                )}
                                {item?.description || a.invoice_id}
                              </span>
                              <span className={`font-semibold ${isCredit ? 'text-orange-600' : 'text-green-700'}`}>
                                {isCredit
                                  ? `-${formatCurrency(Math.abs(a.amount))}`
                                  : formatCurrency(a.amount)
                                }
                              </span>
                            </div>
                          )
                        })
                      )}
                      {payAmountNum > currentBalance && (
                        <p className="text-xs text-amber-600 mt-1">
                          Amount exceeds balance — overpayment of {formatCurrency(payAmountNum - currentBalance)} will be recorded
                        </p>
                      )}
                    </div>
                  )}

                  {allocMode === 'manual' && (
                    <div className="space-y-2">
                      {allocatableItems.map(item => {
                        const isCredit    = item.isCredit
                        const outstanding = isCredit ? item.debit : item.debit - item.amount_paid
                        const itemKey     = isCredit ? item.id : (item.order_id ?? item.invoice_id ?? item.id)
                        return (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 p-2 border rounded-lg ${
                              isCredit ? 'bg-orange-50 border-orange-200' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate flex items-center gap-1">
                                {isCredit && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-semibold">
                                    CREDIT
                                  </span>
                                )}
                                {item.description}
                              </p>
                              <p className="text-xs text-gray-400">
                                {isCredit ? (
                                  <span className="text-orange-600">
                                    Reduces payment by {formatCurrency(outstanding)}
                                  </span>
                                ) : (
                                  <>
                                    Outstanding: {formatCurrency(outstanding)}
                                    {item.paid_status === 'partial' && (
                                      <span className="ml-1 text-amber-600">
                                        (partial — paid {formatCurrency(item.amount_paid)})
                                      </span>
                                    )}
                                  </>
                                )}
                              </p>
                            </div>

                            {isCredit ? (
                              <label className="flex items-center gap-2 text-xs text-orange-700 font-medium cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={manualAlloc[item.id] === String(-item.debit)}
                                  onChange={e => setManualAlloc(prev => ({
                                    ...prev,
                                    [item.id]: e.target.checked ? String(-item.debit) : '0',
                                  }))}
                                  className="rounded"
                                />
                                -{formatCurrency(item.debit)}
                              </label>
                            ) : (
                              <div className="flex items-center border rounded overflow-hidden w-28">
                                <span className="px-2 py-1 bg-gray-50 text-gray-500 border-r text-xs">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  max={outstanding.toFixed(2)}
                                  placeholder={outstanding.toFixed(2)}
                                  value={manualAlloc[itemKey] ?? ''}
                                  onChange={e => setManualAlloc(prev => ({
                                    ...prev,
                                    [itemKey]: e.target.value,
                                  }))}
                                  className="w-full px-2 py-1 text-xs focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {manualTotal !== 0 && (
                        <p className="text-xs text-gray-500 text-right">
                          Net allocating: {formatCurrency(Math.abs(manualTotal))}
                          {manualTotal < 0 && ' (credits applied)'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                               <textarea
                  rows={2}
                  placeholder="Optional notes..."
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 p-5 border-t bg-gray-50 rounded-b-xl sticky bottom-0">
              <button
                onClick={closeModal}
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