'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type ClockEvent = {
  id: string
  raw_time: string
  paid_time: string
  gps_lat: number | null
  gps_lng: number | null
  gps_valid: boolean | null
  trust_score: number | null
  snap_reason: string
  flags: string[] | null
}

type Shift = {
  id: string
  staff_id: string
  work_date: string
  effective_start: string | null
  effective_end: string | null
  paid_hours: number | null
  gross_pay: number | null
  true_shift_cost: number | null
  break_minutes: number | null
  arrived_late_min: number | null
  left_early_min: number | null
  status: string
  approved_at: string | null
  manager_note: string | null
  staff: { name: string; employment_type: string }
  clock_in: ClockEvent | null
  clock_out: ClockEvent | null
}

function toPerth(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit', minute: '2-digit',
  })
}

function perthToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' })
}

function statusBadge(shift: Shift) {
  const base = 'px-2 py-0.5 rounded text-xs font-semibold'
  if (shift.status === 'approved')
    return <span className={`${base} bg-green-100 text-green-800`}>Approved</span>
  if (!shift.effective_end)
    return <span className={`${base} bg-yellow-100 text-yellow-800`}>Active</span>
  return <span className={`${base} bg-orange-100 text-orange-800`}>Pending</span>
}

function gpsBadge(event: ClockEvent | null) {
  if (!event || event.trust_score === null) return null
  const pct = event.trust_score  // already 0-100 smallint
  const colour = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`text-xs font-mono ${colour}`}>{pct}%</span>
}

export default function HoursPage() {
  const [date, setDate]       = useState<string>('')
  const [shifts, setShifts]   = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

    // Set Perth date on client mount to avoid SSR hydration mismatch
  useEffect(() => {
    if (!date) setDate(perthToday())
  }, [date])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/shifts?from=${date}&to=${date}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setShifts(json.shifts ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  const shiftDate = (d: string) => {
    const prev = () => { const x = new Date(d); x.setDate(x.getDate() - 1); setDate(x.toISOString().slice(0,10)) }
    const next = () => { const x = new Date(d); x.setDate(x.getDate() + 1); setDate(x.toISOString().slice(0,10)) }
    return { prev, next }
  }
  const nav = shiftDate(date)

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">⏱ Staff Hours</h1>
        <Link href="/admin/payroll"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          Payroll Export →
        </Link>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button onClick={nav.prev} className="p-2 rounded border hover:bg-gray-50">◀</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border rounded px-3 py-2 text-sm" />
        <button onClick={nav.next} className="p-2 rounded border hover:bg-gray-50">▶</button>
        <button onClick={() => setDate(perthToday())}
          className="text-sm text-indigo-600 hover:underline">Today</button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading shifts…</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No shifts recorded for {date}</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">In</th>
                <th className="px-4 py-3 text-left">Out</th>
                <th className="px-4 py-3 text-right">Paid Hrs</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-center">GPS In</th>
                <th className="px-4 py-3 text-center">GPS Out</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.map(shift => (
                <tr key={shift.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{shift.staff.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{shift.staff.employment_type}</div>
                    {shift.arrived_late_min != null && shift.arrived_late_min > 0 && (
                      <div className="text-xs text-orange-500">{shift.arrived_late_min}min late</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {toPerth(shift.effective_start)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {shift.effective_end
                      ? toPerth(shift.effective_end)
                      : <span className="text-yellow-600 text-xs">Still in</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {shift.paid_hours != null ? shift.paid_hours.toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {shift.gross_pay != null ? `$${Number(shift.gross_pay).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">{gpsBadge(shift.clock_in)}</td>
                  <td className="px-4 py-3 text-center">{gpsBadge(shift.clock_out)}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(shift)}</td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/admin/hours/${date}?shift=${shift.id}`}
                      className="text-indigo-600 hover:underline text-xs font-medium">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold text-sm">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-600">
                  {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {shifts.reduce((a, s) => a + Number(s.paid_hours ?? 0), 0).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  ${shifts.reduce((a, s) => a + Number(s.gross_pay ?? 0), 0).toFixed(2)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}