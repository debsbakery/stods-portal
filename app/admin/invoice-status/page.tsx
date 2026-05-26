'use client'

import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Undo2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Allocation {
  id: string
  payment_id: string | null
  amount: number
  is_full_payment: boolean
  short_amount: number
  allocated_at: string
}
interface Invoice {
  id: string
  delivery_date: string
  total_amount: number
  amount_paid: number
  status: string
  invoice_number: number | null
  customer_id: string
  customer_name: string
  ar_amount: number
  ar_amount_paid: number
  balance: number
  payment_status: 'paid' | 'part_paid' | 'unpaid'
  allocations: Allocation[]
}

type Tab = 'all' | 'unpaid' | 'part_paid' | 'paid'

export default function InvoiceStatusPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('unpaid')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const setPreset = (days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    setDateFrom(from.toISOString().split('T')[0])
    setDateTo(to.toISOString().split('T')[0])
  }

  useEffect(() => {
    setPreset(90)
  }, [])

  useEffect(() => {
    if (dateFrom && dateTo) fetchInvoices()
  }, [dateFrom, dateTo])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/invoices/list-ar?from=${dateFrom}&to=${dateTo}`)
      const data = await res.json()
      if (data.invoices) setInvoices(data.invoices)
    } catch (err) {
      console.error('Failed to fetch invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUnapply = async (allocationId: string) => {
    if (!confirm('Unapply this payment? The amount will return to the customer\'s balance.')) return
    setActionLoading(allocationId)
    try {
      const res = await fetch('/api/ar/unapply-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocation_id: allocationId }),
      })
      const data = await res.json()
      if (res.ok) {
        fetchInvoices()
      } else {
        alert('Error: ' + (data.error || 'Failed to unapply'))
      }
    } finally {
      setActionLoading(null)
    }
  }

  const handleManualMark = async (orderId: string, newStatus: 'paid' | 'invoiced') => {
    if (!confirm(`Manually mark this invoice as ${newStatus}? This is a manual override.`)) return
    setActionLoading(orderId)
    try {
      const res = await fetch('/api/admin/invoices/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      })
      if (res.ok) fetchInvoices()
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    if (search.length > 0) setTab('all')
  }, [search])

  const filtered = useMemo(() => {
    let list = invoices
    if (tab !== 'all') {
      list = list.filter(inv => inv.payment_status === tab)
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(inv =>
        inv.customer_name.toLowerCase().includes(s) ||
        String(inv.invoice_number || '').includes(s)
      )
    }
    return list
  }, [invoices, tab, search])

  const counts = useMemo(() => ({
    all: invoices.length,
    unpaid: invoices.filter(i => i.payment_status === 'unpaid').length,
    part_paid: invoices.filter(i => i.payment_status === 'part_paid').length,
    paid: invoices.filter(i => i.payment_status === 'paid').length,
  }), [invoices])

  const totals = useMemo(() => ({
    total: filtered.reduce((s, i) => s + i.total_amount, 0),
    paid: filtered.reduce((s, i) => s + i.ar_amount_paid, 0),
    outstanding: filtered.reduce((s, i) => s + i.balance, 0),
  }), [filtered])

  const statusBadge = (status: string) => {
    const config: Record<string, { bg: string; icon: any; label: string }> = {
      paid:      { bg: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Paid' },
      part_paid: { bg: 'bg-amber-100 text-amber-800', icon: <Clock className="w-3.5 h-3.5" />, label: 'Part Paid' },
      unpaid:    { bg: 'bg-red-100 text-red-800', icon: <XCircle className="w-3.5 h-3.5" />, label: 'Unpaid' },
    }
    const c = config[status] || config.unpaid
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>
        {c.icon} {c.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin')} className="p-2 hover:bg-gray-200 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold">Invoice Status</h1>
      </div>

      {/* Date Controls */}
      <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            {[
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
              { label: '6m', days: 180 },
              { label: '1y', days: 365 },
            ].map(p => (
              <button key={p.label} onClick={() => setPreset(p.days)}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search customer or invoice number..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-lg p-1 shadow-sm">
        {([
          { key: 'all' as Tab, label: 'All' },
          { key: 'unpaid' as Tab, label: 'Unpaid' },
          { key: 'part_paid' as Tab, label: 'Part Paid' },
          { key: 'paid' as Tab, label: 'Paid' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No invoices found</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Invoice #</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Balance</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{inv.customer_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">
                      {inv.invoice_number ? `#${String(inv.invoice_number).padStart(6, '0')}` : inv.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {inv.delivery_date ? new Date(inv.delivery_date + 'T00:00:00').toLocaleDateString('en-AU') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">${inv.total_amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">
                      {inv.ar_amount_paid > 0 ? `$${inv.ar_amount_paid.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {inv.balance > 0.01 ? (
                        <span className="text-red-600">${inv.balance.toFixed(2)}</span>
                      ) : (
                        <span className="text-green-600">$0.00</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(inv.payment_status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Unapply — only if payment_allocations exist */}
                        {inv.allocations.length > 0 && inv.allocations.map(alloc => (
                          <button
                            key={alloc.id}
                            onClick={() => handleUnapply(alloc.id)}
                            disabled={actionLoading === alloc.id}
                            className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-medium flex items-center gap-1 whitespace-nowrap"
                            title={`Unapply $${alloc.amount.toFixed(2)}`}
                          >
                            <Undo2 className="w-3 h-3" />
                            ${alloc.amount.toFixed(2)}
                          </button>
                        ))}

                        {/* Manual overrides */}
                        {inv.payment_status !== 'paid' && (
                          <button
                            onClick={() => handleManualMark(inv.id, 'paid')}
                            disabled={actionLoading === inv.id}
                            className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded font-medium">
                            Mark Paid
                          </button>
                        )}
                        {inv.payment_status === 'paid' && (
                          <button
                            onClick={() => handleManualMark(inv.id, 'invoiced')}
                            disabled={actionLoading === inv.id}
                            className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded font-medium">
                            Mark Unpaid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 px-4 py-3 border-t flex flex-wrap gap-6 text-sm">
            <span className="font-medium">
              Total: <span className="font-mono">${totals.total.toFixed(2)}</span>
            </span>
            <span className="text-green-700">
              Paid: <span className="font-mono">${totals.paid.toFixed(2)}</span>
            </span>
            <span className="text-red-700">
              Outstanding: <span className="font-mono">${totals.outstanding.toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm text-blue-800">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>AR-Linked:</strong> Payment status is calculated from AR transactions.
          "Mark Paid/Unpaid" is a manual override for edge cases (cash, contra, etc.).
          Use the <strong>Unapply</strong> button to reverse a payment allocation and free funds for reallocation.
        </div>
      </div>
    </div>
  )
}