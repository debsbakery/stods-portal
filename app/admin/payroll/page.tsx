'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type StaffSummary = {
  staff_id: string
  name: string
  employment_type: string
  base_hourly_rate: number | null
  shift_count: number
  total_paid_hours: number
  normal_hours: number
  saturday_hours: number
  sunday_hours: number
  public_holiday_hours: number
  leave_hours: number
  total_gross_pay: number
  total_true_cost: number
  pending_approval: number
}

type Totals = {
  total_paid_hours: number
  normal_hours: number
  saturday_hours: number
  sunday_hours: number
  public_holiday_hours: number
  leave_hours: number
  total_gross_pay: number
  total_true_cost: number
  staff_count: number
  pending_approval: number
}

function currentWeekMonday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff)
  return now.toISOString().slice(0, 10)
}

export default function PayrollPage() {
  const [weekStart, setWeekStart] = useState(currentWeekMonday)
  const [summary, setSummary] = useState<StaffSummary[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [sickHours, setSickHours] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/payroll?week_start=${weekStart}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSummary(json.summary ?? [])
      setTotals(json.totals ?? null)
      setSickHours({})
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

  function fmt(n: number) { return n > 0 ? n.toFixed(2) : '—' }

  const exportCSV = () => {
    const rows = [
      ['Staff Name', 'Type', 'Normal Hrs', 'Sat Hrs', 'Sun Hrs', 'PH Hrs', 'Sick/Leave Hrs', 'Total Hrs', 'Gross Pay', 'Pending'],
      ...summary.map(s => [
        s.name,
        s.employment_type,
        s.normal_hours.toFixed(2),
        s.saturday_hours.toFixed(2),
        s.sunday_hours.toFixed(2),
        s.public_holiday_hours.toFixed(2),
        (s.leave_hours + (sickHours[s.staff_id] ?? 0)).toFixed(2),
        (s.total_paid_hours + (sickHours[s.staff_id] ?? 0)).toFixed(2),
        s.total_gross_pay.toFixed(2),
        s.pending_approval,
      ]),
      [],
      ['TOTALS', '',
       totals?.normal_hours.toFixed(2) ?? '',
       totals?.saturday_hours.toFixed(2) ?? '',
       totals?.sunday_hours.toFixed(2) ?? '',
       totals?.public_holiday_hours.toFixed(2) ?? '',
       ((totals?.leave_hours ?? 0) + Object.values(sickHours).reduce((a, b) => a + b, 0)).toFixed(2),
       ((totals?.total_paid_hours ?? 0) + Object.values(sickHours).reduce((a, b) => a + b, 0)).toFixed(2),
       totals?.total_gross_pay.toFixed(2) ?? '',
       totals?.pending_approval ?? 0,
      ],
    ]

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${weekStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalSick = Object.values(sickHours).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700 text-sm">← Back</Link>
          <h1 className="text-2xl font-bold text-gray-900">💰 Weekly Payroll</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/hours"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            ⏱ Hours
          </Link>
          <button onClick={exportCSV} disabled={summary.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-2 rounded border hover:bg-gray-50">◀</button>
        <span className="text-sm font-medium text-gray-700">
          {weekStart} → {weekEnd}
        </span>
        <button onClick={nextWeek} className="p-2 rounded border hover:bg-gray-50">▶</button>
        <button onClick={() => setWeekStart(currentWeekMonday())}
          className="text-sm text-indigo-600 hover:underline">This Week</button>
      </div>

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
        <div className="text-center py-12 text-gray-400">No shifts for this week</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-3 py-3 text-right">Normal</th>
                <th className="px-3 py-3 text-right">Sat</th>
                <th className="px-3 py-3 text-right">Sun</th>
                <th className="px-3 py-3 text-right">PH</th>
                <th className="px-3 py-3 text-right">Sick/Leave</th>
                <th className="px-3 py-3 text-right font-bold">Total Hrs</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map(s => {
                const sick = sickHours[s.staff_id] ?? 0
                const totalHrs = s.total_paid_hours + sick
                return (
                  <tr key={s.staff_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 text-xs">{s.employment_type}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(s.normal_hours)}</td>
                    <td className="px-3 py-3 text-right font-mono text-blue-600">{fmt(s.saturday_hours)}</td>
                    <td className="px-3 py-3 text-right font-mono text-purple-600">{fmt(s.sunday_hours)}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(s.public_holiday_hours)}</td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" min="0" step="0.25" placeholder="0"
                        value={sick || ''}
                        onChange={e => setSickHours(prev => ({ ...prev, [s.staff_id]: parseFloat(e.target.value) || 0 }))}
                        className="w-16 border rounded px-2 py-1 text-right text-sm font-mono focus:ring-1 focus:ring-amber-400" />
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{totalHrs.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      {s.pending_approval > 0 ? (
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                          {s.pending_approval} pending
                        </span>
                      ) : (
                        <span className="text-green-500 text-xs">✔ Approved</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-100 font-bold text-sm">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-gray-700">
                  {totals?.staff_count ?? 0} staff
                </td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals?.normal_hours ?? 0)}</td>
                <td className="px-3 py-3 text-right font-mono text-blue-600">{fmt(totals?.saturday_hours ?? 0)}</td>
                <td className="px-3 py-3 text-right font-mono text-purple-600">{fmt(totals?.sunday_hours ?? 0)}</td>
                <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(totals?.public_holiday_hours ?? 0)}</td>
                <td className="px-3 py-3 text-right font-mono">{totalSick > 0 ? totalSick.toFixed(2) : '—'}</td>
                <td className="px-3 py-3 text-right font-mono font-bold">
                  {((totals?.total_paid_hours ?? 0) + totalSick).toFixed(2)}
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