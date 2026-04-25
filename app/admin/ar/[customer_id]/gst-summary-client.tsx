'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Loader2, Receipt, Calendar } from 'lucide-react'

interface MonthSummary {
  month:          string
  total_inc_gst:  number
  gst_inc_total:  number
  gst_free_total: number
  gst_amount:     number
  total_ex_gst:   number
  invoice_count:  number
}

interface Totals {
  total_inc_gst:  number
  gst_inc_total:  number
  gst_free_total: number
  gst_amount:     number
  total_ex_gst:   number
}

interface Props {
  customerId:    string
  customerName:  string
}

const RANGES = [
  { label: 'This Month',    months: 1  },
  { label: 'Last 3 Months', months: 3  },
  { label: 'This Year',     months: 12 },
  { label: 'All Time',      months: 0  },
]

// Helper: format Date to yyyy-MM-dd
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function GstSummaryClient({ customerId, customerName }: Props) {
  const [monthly,  setMonthly]  = useState<MonthSummary[]>([])
  const [totals,   setTotals]   = useState<Totals | null>(null)
  const [loading,  setLoading]  = useState(true)

  // ── Default to last 3 months ─────────────────────────────────────────────
  const today        = new Date()
  const threeAgo     = new Date()
  threeAgo.setMonth(threeAgo.getMonth() - 3)

  const [activePreset, setActivePreset] = useState<number | 'custom'>(3)
  const [dateFrom,     setDateFrom]     = useState(toDateStr(threeAgo))
  const [dateTo,       setDateTo]       = useState(toDateStr(today))

  // Fetch whenever dates change
  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) {
      fetchGst()
    }
  }, [dateFrom, dateTo])

  async function fetchGst() {
    setLoading(true)
    try {
      let url = `/api/admin/ar/gst-summary/${customerId}`
      if (activePreset !== 0) {
        // Always use the date pickers (presets fill them in)
        url += `?from=${dateFrom}&to=${dateTo}`
      }
      const res  = await fetch(url)
      const data = await res.json()
      setMonthly(data.monthly ?? [])
      setTotals(data.totals  ?? null)
    } finally {
      setLoading(false)
    }
  }

  // ── Apply preset (fills the date pickers) ────────────────────────────────
  function applyPreset(months: number) {
    setActivePreset(months)
    if (months === 0) {
      // All Time — clear date filter
      setDateFrom('')
      setDateTo('')
      // Manually fetch since useEffect won't fire on empty dates
      setTimeout(fetchGstAllTime, 0)
      return
    }
    const to   = new Date()
    const from = new Date()
    from.setMonth(from.getMonth() - months)
    setDateFrom(toDateStr(from))
    setDateTo(toDateStr(to))
  }

  async function fetchGstAllTime() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/ar/gst-summary/${customerId}`)
      const data = await res.json()
      setMonthly(data.monthly ?? [])
      setTotals(data.totals  ?? null)
    } finally {
      setLoading(false)
    }
  }

  const isAllTime = activePreset === 0

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex justify-between items-start mb-5 flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-green-700" />
          GST Summary — {customerName}
        </h2>
      </div>

      {/* ── Date controls ── */}
      <div className="bg-gray-50 border rounded-lg p-4 mb-5">
        {/* Always-visible date pickers */}
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1 font-medium flex items-center gap-1">
              <Calendar className="h-3 w-3" /> From
            </label>
            <input
              type="date"
              value={dateFrom}
              disabled={isAllTime}
              onChange={e => {
                setDateFrom(e.target.value)
                setActivePreset('custom')
              }}
              className="border-2 border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1 font-medium flex items-center gap-1">
              <Calendar className="h-3 w-3" /> To
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              disabled={isAllTime}
              onChange={e => {
                setDateTo(e.target.value)
                setActivePreset('custom')
              }}
              className="border-2 border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Quick presets */}
        <p className="text-xs text-gray-500 mb-2">Quick presets:</p>
        <div className="flex flex-wrap gap-2">
          {RANGES.map(r => {
            const isActive = activePreset === r.months
            return (
              <button
                key={r.label}
                onClick={() => applyPreset(r.months)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  isActive
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-600 hover:bg-green-50'
                }`}
              >
                {r.label}
              </button>
            )
          })}
          {activePreset === 'custom' && (
            <span className="px-3 py-1.5 text-xs rounded-lg border-2 border-amber-400 bg-amber-50 text-amber-700 font-medium">
              ✏️ Custom
            </span>
          )}
        </div>

        {/* Status banner */}
        <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-white border">
          {isAllTime ? (
            <>📊 Showing <strong>all time</strong></>
          ) : !dateFrom || !dateTo ? (
            <span className="text-red-600">⚠️ Please select both dates</span>
          ) : (
            <>📅 Showing: <strong>{dateFrom}</strong> to <strong>{dateTo}</strong></>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-700" />
        </div>
      ) : monthly.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No invoices found for this period</p>
      ) : (
        <>
          {/* Monthly breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-y">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Month</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Invoices</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">GST-Inc Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">GST-Free Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">GST Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Ex-GST</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Inc-GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map(m => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{m.month}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{m.invoice_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {formatCurrency(m.gst_inc_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {formatCurrency(m.gst_free_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">
                      {formatCurrency(m.gst_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {formatCurrency(m.total_ex_gst)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {formatCurrency(m.total_inc_gst)}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals row */}
              {totals && (
                <tfoot>
                  <tr className="bg-green-50 border-t-2 border-green-200 font-semibold">
                    <td className="px-4 py-3 text-green-800">TOTAL</td>
                    <td className="px-4 py-3 text-center text-green-700">
                      {monthly.reduce((s, m) => s + m.invoice_count, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-800">
                      {formatCurrency(totals.gst_inc_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-800">
                      {formatCurrency(totals.gst_free_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700 text-base">
                      {formatCurrency(totals.gst_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-800">
                      {formatCurrency(totals.total_ex_gst)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-800 text-base">
                      {formatCurrency(totals.total_inc_gst)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* GST summary cards */}
          {totals && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <p className="text-xs text-blue-500 mb-1">GST Collected</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.gst_amount)}</p>
                <p className="text-xs text-blue-400 mt-1">÷11 of GST-inc sales</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
                <p className="text-xs text-gray-500 mb-1">GST-Free Sales</p>
                <p className="text-2xl font-bold text-gray-700">{formatCurrency(totals.gst_free_total)}</p>
                <p className="text-xs text-gray-400 mt-1">No GST applies</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
                <p className="text-xs text-green-500 mb-1">Total Ex-GST</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.total_ex_gst)}</p>
                <p className="text-xs text-green-400 mt-1">Net revenue</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}