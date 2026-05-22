'use client'

import { useEffect, useState, useCallback } from 'react'

type StaffSummary = {
  staff_id: string
  name: string
  employment_type: string
  base_hourly_rate: number | null
  shift_count: number
  total_paid_hours: number
  total_gross_pay: number
  total_true_cost: number
  pending_approval: number
}

type Totals = {
  total_paid_hours: number
  total_gross_pay: number
  total_true_cost: number
  staff_count: number
  pending_approval: number
}

// Get Monday of current Perth week
function currentWeekMonday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff)
  return now.toISOString().slice(0, 10)
}

export default function PayrollPage() {
  const [weekStart, setWeekStart] = useState(currentWeekMonday)
  const [summary, setSummary]     = useState<StaffSummary[]>([])
  const [totals, setTotals]       = useState<Totals | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/payroll?week_start=${weekStart}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSummary(json.summary ?? [])
      setTotals(json.totals ?? null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { fetchPayroll() }, [fetchPayroll])

  const prevWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const nextWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }

  const weekEnd = (() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  })()

  const exportCSV = () => {
    const rows = [
      ['Staff Name', 'Type', 'Rate', 'Shifts', 'Paid Hours', 'Gross Pay', 'True Cost', 'Pending'],
      ...summary.map(s => [
        s.name,
        s.employment_type,
        s.base_hourly_rate?.toFixed(2) ?? '',
        s.shift_count,
        s.total_paid_hours.toFixed(2),
        s.total_gross_pay.toFixed(2),
        s.total_true_cost.toFixed(2),
        s.pending_approval,
      ]),
      [],
      ['TOTALS', '', '', totals?.staff_count ?? 0,
       totals?.total_paid_hours.toFixed(2) ?? '',
       totals?.total_gross_pay.toFixed(2)  ?? '',
       totals?.total_true_cost.toFixed(2)  ?? '',
       totals?.pending_approval ?? 0,
      ],
    ]

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `payroll-${weekStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">💰 Weekly Payroll</h1>
        <button onClick={exportCSV} disabled={summary.length === 0}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          ⬇ Export CSV
        </button>
      </div>

      {/* Week selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-2 rounded border hover:bg-gray-50">◀</button>
        <span className="text-sm font-medium text-gray-700">
          {weekStart} → {weekEnd}
        </span>
        <button onClick={nextWeek} className="p-2 rounded border hover:bg-gray-50">▶</button>
        <button onClick={() => setWeekStart(currentWeekMonday())}
          className="text-sm text-indigo-600 hover:underline">This Week</button>
      </div>

      {/* Pending warning */}
      {totals && totals.pending_approval > 0 && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg text-sm">
          ⚠️ <strong>{totals.pending_approval}</strong> shift{totals.pending_approval !== 1 ? 's' : ''} still pending approval —
          review in <a href="/admin/hours" className="underline">Hours</a> before exporting.
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Calculating payroll…</div>
      ) : summary.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No approved shifts for this week</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Staff Member</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Shifts</th>
                  <th className="px-4 py-3 text-right">Paid Hrs</th>
                  <th className="px-4 py-3 text-right">Gross Pay</th>
                  <th className="px-4 py-3 text-right">True Cost</th>
                  <th className="px-4 py-3 text-center">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.map(s => (
                  <tr key={s.staff_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{s.employment_type}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">
                      {s.base_hourly_rate != null ? `$${s.base_hourly_rate.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.shift_count}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {s.total_paid_hours.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {s.total_gross_pay > 0 ? `$${s.total_gross_pay.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {s.total_true_cost > 0 ? `$${s.total_true_cost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.pending_approval > 0 ? (
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                          {s.pending_approval}
                        </span>
                      ) : (
                        <span className="text-green-500 text-xs">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="bg-gray-100 font-bold text-sm">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-gray-700">
                      {totals.staff_count} staff member{totals.staff_count !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{totals.total_paid_hours.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">${totals.total_gross_pay.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">${totals.total_true_cost.toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}