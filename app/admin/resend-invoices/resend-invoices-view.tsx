'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'

interface Customer {
  id: string
  business_name: string | null
  email: string | null
}

interface Order {
  id: string
  delivery_date: string
  invoice_number: number | null
  total_amount: number
  status: string
  customers: { business_name: string | null; email: string | null } | null
}

interface Props {
  customers:          Customer[]
  orders:             Order[]
  selectedCustomerId: string | null
  startDate:          string
  endDate:            string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

export default function ResendInvoicesView({
  customers,
  orders,
  selectedCustomerId,
  startDate,
  endDate,
}: Props) {
  const router = useRouter()
  const [sending,  setSending]  = useState(false)
  const [results,  setResults]  = useState<Record<string, 'sent' | 'error' | 'sending'>>({})
  const [allDone,  setAllDone]  = useState(false)

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  function navigate(params: Record<string, string>) {
    const p = new URLSearchParams()
    if (selectedCustomerId) p.set('customer_id', selectedCustomerId)
    p.set('start_date', startDate)
    p.set('end_date',   endDate)
    Object.entries(params).forEach(([k, v]) => p.set(k, v))
    router.push(`/admin/resend-invoices?${p.toString()}`)
  }

  async function resendAll() {
    if (orders.length === 0) return
    setSending(true)
    setAllDone(false)
    setResults({})

    // Group by delivery date
    const dateGroups = new Map<string, Order[]>()
    for (const order of orders) {
      if (!dateGroups.has(order.delivery_date)) {
        dateGroups.set(order.delivery_date, [])
      }
      dateGroups.get(order.delivery_date)!.push(order)
    }

    // Mark all sending
    const initial: Record<string, 'sent' | 'error' | 'sending'> = {}
    for (const order of orders) initial[order.id] = 'sending'
    setResults(initial)

    for (const [deliveryDate, dateOrders] of dateGroups.entries()) {
      try {
        const res  = await fetch('/api/admin/batch-invoice', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
       // In resendAll() — change the fetch body
body: JSON.stringify({
  delivery_date: deliveryDate,
  sendEmails:    true,
  emailOnly:     true,
  customer_id:   selectedCustomerId,   // ← ADD THIS
})
        })
        const data = await res.json()
        const status = res.ok && data.success ? 'sent' : 'error'
        setResults(prev => {
          const next = { ...prev }
          for (const o of dateOrders) next[o.id] = status
          return next
        })
      } catch {
        setResults(prev => {
          const next = { ...prev }
          for (const o of dateOrders) next[o.id] = 'error'
          return next
        })
      }
      await new Promise(r => setTimeout(r, 600))
    }

    setSending(false)
    setAllDone(true)
  }

  async function resendOne(order: Order) {
    setResults(prev => ({ ...prev, [order.id]: 'sending' }))
    try {
      const res  = await fetch('/api/admin/batch-invoice', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // In resendOne() — same fix
body: JSON.stringify({
  delivery_date: order.delivery_date,
  sendEmails:    true,
  emailOnly:     true,
  customer_id:   selectedCustomerId,   // ← ADD THIS
}),
      })
      const data = await res.json()
      setResults(prev => ({
        ...prev,
        [order.id]: res.ok && data.success ? 'sent' : 'error',
      }))
    } catch {
      setResults(prev => ({ ...prev, [order.id]: 'error' }))
    }
  }

  const sentCount  = Object.values(results).filter(r => r === 'sent').length
  const errorCount = Object.values(results).filter(r => r === 'error').length

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <a
        href="/admin/reports"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </a>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Resend Invoices</h1>
        <p className="text-gray-500 mt-1">Resend invoice emails for a customer by date range</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <select
              value={selectedCustomerId ?? ''}
              onChange={e => navigate({ customer_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">— Select customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.business_name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => navigate({ start_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => navigate({ end_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Quick range buttons */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { label: 'This Week',  days: 7  },
            { label: 'This Month', days: 31 },
            { label: 'Last Month', days: 60 },
            { label: 'Last 90 Days', days: 90 },
          ].map(({ label, days }) => {
            const end   = new Date()
            const start = new Date()
            if (label === 'Last Month') {
              start.setMonth(start.getMonth() - 1)
              start.setDate(1)
              end.setDate(0) // last day of previous month
            } else {
              start.setDate(start.getDate() - days)
            }
            return (
              <button
                key={label}
                onClick={() => navigate({
                  start_date: start.toISOString().split('T')[0],
                  end_date:   end.toISOString().split('T')[0],
                })}
                className="px-3 py-1 text-xs border border-gray-200 rounded-full hover:bg-gray-50 text-gray-600 transition"
              >
                {label}
              </button>
            )
          })}
        </div>

        {selectedCustomer && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <span className="font-medium text-green-800">{selectedCustomer.business_name}</span>
            {selectedCustomer.email && (
              <span className="text-green-600 ml-2">→ {selectedCustomer.email}</span>
            )}
          </div>
        )}
      </div>

      {/* Orders */}
      {selectedCustomerId && orders.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No invoiced orders found for this date range</p>
        </div>
      )}

      {selectedCustomerId && orders.length > 0 && (
        <>
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {orders.length} invoice{orders.length !== 1 ? 's' : ''} found
                </p>
                <p className="text-sm text-gray-500">
                  Total: {fmt(orders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0))}
                  <span className="ml-2 text-gray-400">
                    {fmtDate(orders[0].delivery_date)} → {fmtDate(orders[orders.length - 1].delivery_date)}
                  </span>
                </p>
                {allDone && (
                  <p className="text-sm mt-1">
                    <span className="text-green-600 font-medium">✅ {sentCount} sent</span>
                    {errorCount > 0 && (
                      <span className="text-red-600 font-medium ml-3">❌ {errorCount} failed</span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={resendAll}
                disabled={sending}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium text-sm transition"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  : <><Send className="h-4 w-4" /> Resend All</>
                }
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Invoice #</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(order => {
                  const result = results[order.id]
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{fmtDate(order.delivery_date)}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {order.invoice_number
                          ? `#${String(order.invoice_number).padStart(6, '0')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {fmt(Number(order.total_amount ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {result === 'sending' && <Loader2 className="h-4 w-4 animate-spin text-blue-500 mx-auto" />}
                        {result === 'sent'    && <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />}
                        {result === 'error'   && <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                        {!result             && <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => resendOne(order)}
                          disabled={sending || result === 'sending'}
                          className="text-xs px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition text-gray-600"
                        >
                          Resend
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selectedCustomerId && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a customer to get started</p>
        </div>
      )}
    </div>
  )
}