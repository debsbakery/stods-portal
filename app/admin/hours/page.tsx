'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'

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
  const pct = event.trust_score
  const colour = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`text-xs font-mono ${colour}`}>{pct}%</span>
}

export default function HoursPage() {
  const [date, setDate] = useState<string>('')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!date) setDate(perthToday())
  }, [date])

  const fetchShifts = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/shifts?from=${date}&to=${date}`)
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

  const nav = {
    prev: () => { const x = new Date(date); x.setDate(x.getDate() - 1); setDate(x.toISOString().slice(0, 10)) },
    next: () => { const x = new Date(date); x.setDate(x.getDate() + 1); setDate(x.toISOString().slice(0, 10)) },
  }

  // Manual entry state
  const [staffList, setStaffList] = useState<{ id: string; name: string; primary_department: string }[]>([])
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({
    staff_id: '',
    clock_in_time: '06:00',
    clock_out_time: '14:00',
    department: 'production',
    reason: 'Forgot to clock in',
    clock_in_only: false,
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/staff')
      .then(r => r.json())
      .then(d => setStaffList(d.staff ?? []))
      .catch(() => {})
  }, [])

  async function handleManualSubmit() {
    if (!manualForm.staff_id) { setManualError('Select a staff member'); return }
    if (!manualForm.clock_in_only && !manualForm.clock_out_time) {
      setManualError('Enter clock out time or toggle clock-in only'); return
    }
    setManualSaving(true)
    setManualError(null)
    try {
      const payload: any = {
        staff_id: manualForm.staff_id,
        work_date: date,
        clock_in_time: manualForm.clock_in_time,
        department: manualForm.department,
        reason: manualForm.reason,
      }
      if (!manualForm.clock_in_only) {
        payload.clock_out_time = manualForm.clock_out_time
      }
      const res = await fetch('/api/admin/shifts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowManual(false)
      setManualForm({
        staff_id: '', clock_in_time: '06:00', clock_out_time: '14:00',
        department: 'production', reason: 'Forgot to clock in', clock_in_only: false,
      })
      fetchShifts()
    } catch (e: any) {
      setManualError(e.message)
    } finally {
      setManualSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">⏱ Staff Hours</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setManualError(null); setShowManual(true) }}
            className="flex items-center gap-1.5 bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-800">
            <Plus className="h-4 w-4" /> Manual Entry
          </button>
          <Link href="/admin/payroll"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            Payroll Export →
          </Link>
        </div>
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
                  <td className="px-4 py-3 text-gray-700">{toPerth(shift.effective_start)}</td>
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

      {/* Manual Entry Modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowManual(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b bg-gray-50 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Manual Clock Entry</h3>
                <p className="text-sm text-gray-500">
                  {date && new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
                    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              </div>
              <button onClick={() => setShowManual(false)} className="p-2 hover:bg-gray-200 rounded-lg">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Staff Member</label>
                <select value={manualForm.staff_id}
                  onChange={e => setManualForm(p => ({ ...p, staff_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                  <option value="">Select staff…</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Clock-in only toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={manualForm.clock_in_only}
                    onChange={e => setManualForm(p => ({ ...p, clock_in_only: e.target.checked }))}
                    className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
                <span className="text-sm text-gray-700 font-medium">Clock-in only</span>
                <span className="text-xs text-gray-400">(no clock out yet)</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Clock In</label>
                  <input type="time" value={manualForm.clock_in_time}
                    onChange={e => setManualForm(p => ({ ...p, clock_in_time: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${manualForm.clock_in_only ? 'text-gray-300' : 'text-gray-700'}`}>
                    Clock Out
                  </label>
                  <input type="time" value={manualForm.clock_out_time}
                    onChange={e => setManualForm(p => ({ ...p, clock_out_time: e.target.value }))}
                    disabled={manualForm.clock_in_only}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 ${
                      manualForm.clock_in_only ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                    }`} />
                </div>
              </div>

              {manualForm.clock_in_only && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  ⏱ This will create an open shift. Staff can clock out normally, or you can add the end time later.
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Department</label>
                <select value={manualForm.department}
                  onChange={e => setManualForm(p => ({ ...p, department: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                  <option value="production">🍞 Production</option>
                  <option value="shop">🏪 Shop</option>
                  <option value="delivery">🚚 Delivery</option>
                  <option value="admin">📋 Admin</option>
                  <option value="management">👔 Management</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason</label>
                <input type="text" value={manualForm.reason}
                  onChange={e => setManualForm(p => ({ ...p, reason: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g. QR scan failed" />
              </div>
              {manualError && <p className="text-sm text-red-600">{manualError}</p>}
            </div>
            <div className="p-5 border-t bg-gray-50 rounded-b-2xl flex gap-2">
              <button onClick={handleManualSubmit} disabled={manualSaving}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50">
                {manualSaving ? 'Saving…' : manualForm.clock_in_only ? 'Clock In Now' : 'Add Shift'}
              </button>
              <button onClick={() => setShowManual(false)}
                className="px-4 py-2.5 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}