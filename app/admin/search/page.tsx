'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type InvoiceResult = {
  id: string
  invoice_number: number | null
  purchase_order_number: string | null
  docket_number: string | null
  customer_business_name: string | null
  customer_email: string | null
  delivery_date: string | null
  total_amount: number | null
  amount_paid: number | null
  balance_due: number | null
  status: string | null
  weekly_invoice_id: string | null
}

export default function SearchPage() {
  const router = useRouter()
  const [q, setQ]               = useState('')
  const [results, setResults]   = useState<InvoiceResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); setSearched(false); return }
    setLoading(true)
    setSearched(true)
    try {
      const res  = await fetch(`/api/admin/search/invoices?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.results ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search(q)
  }

  const statusColour = (s: string | null) => {
    if (s === 'paid')      return 'bg-green-100 text-green-800'
    if (s === 'cancelled') return 'bg-gray-100 text-gray-500'
    return 'bg-orange-100 text-orange-800'
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🔍 Invoice Search</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search by invoice number, customer name, PO number or docket number
        </p>
      </div>

      {/* Search input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. 568 or Dragonfly or PO-1234"
          className="flex-1 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        <button
          onClick={() => search(q)}
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No invoices found for <strong>{q}</strong>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">PO / Docket</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-indigo-700">
                    #{r.invoice_number}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {r.customer_business_name ?? r.customer_email ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.delivery_date ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.purchase_order_number && <div>PO: {r.purchase_order_number}</div>}
                    {r.docket_number && <div>Docket: {r.docket_number}</div>}
                    {!r.purchase_order_number && !r.docket_number && '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${Number(r.total_amount ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {Number(r.balance_due ?? 0) > 0
                      ? <span className="text-red-600">${Number(r.balance_due).toFixed(2)}</span>
                      : <span className="text-green-600">$0.00</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusColour(r.status)}`}>
                      {r.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => router.push(`/admin/orders/${r.id}/edit`)}
                      className="text-indigo-600 hover:underline text-xs font-medium"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}