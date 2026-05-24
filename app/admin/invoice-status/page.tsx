'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Check, X, Search } from 'lucide-react'

type Order = {
  id: string
  invoice_number: number | null
  delivery_date: string
  total_amount: number
  status: string
  customer: { business_name: string }
}

export default function InvoiceStatusPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'invoiced' | 'paid' | 'all'>('invoiced')

   // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchOrders()
  }, [filter])
  async function fetchOrders() {
    setLoading(true)
    const res = await fetch(`/api/admin/invoices/list?status=${filter}`)
    const data = await res.json()
    setOrders(data.orders ?? [])
    setLoading(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    const filtered = filteredOrders()
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(o => o.id)))
    }
  }

  function filteredOrders() {
    if (!search) return orders
    const s = search.toLowerCase()
    return orders.filter(o =>
      o.customer.business_name.toLowerCase().includes(s) ||
      String(o.invoice_number ?? '').includes(s)
    )
  }

  async function markAs(action: 'mark_paid' | 'mark_unpaid') {
    if (selected.size === 0) return
    if (!confirm(`${action === 'mark_paid' ? 'Mark' : 'Unmark'} ${selected.size} invoice(s) as ${action === 'mark_paid' ? 'PAID' : 'UNPAID'}?\n\nCustomer balances will be recalculated.`)) return

    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/invoices/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: [...selected], action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg(`✅ ${data.updated} invoice(s) updated. Balances recalculated.`)
      setSelected(new Set())
      fetchOrders()
    } catch (e: any) {
      setMsg(`❌ ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const filtered = filteredOrders()
  const selectedTotal = filtered.filter(o => selected.has(o.id)).reduce((s, o) => s + Number(o.total_amount), 0)

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-2 rounded hover:bg-gray-100">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">📋 Invoice Status Manager</h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['invoiced', 'paid', 'all'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setSelected(new Set()) }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f === 'invoiced' ? '📄 Unpaid' : f === 'paid' ? '✅ Paid' : '📁 All'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search customer or invoice #..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {selected.size} selected (${selectedTotal.toFixed(2)})
            </span>
            {filter !== 'paid' && (
              <button onClick={() => markAs('mark_paid')} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                <Check className="h-4 w-4" /> Mark Paid
              </button>
            )}
            {filter !== 'invoiced' && (
              <button onClick={() => markAs('mark_unpaid')} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                <X className="h-4 w-4" /> Mark Unpaid
              </button>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>{msg}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No invoices found</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={selectAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(o => (
                <tr key={o.id} className={`hover:bg-gray-50 ${selected.has(o.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => toggleSelect(o.id)} style={{ cursor: 'pointer' }}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(o.id)}
                      onChange={() => toggleSelect(o.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3 font-mono font-medium">{o.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.customer.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(o.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">${Number(o.total_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      o.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm text-gray-600 font-medium">
                  {filtered.length} invoice(s)
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  ${filtered.reduce((s, o) => s + Number(o.total_amount), 0).toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}