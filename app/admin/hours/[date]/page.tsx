'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

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
  paid_minutes: number | null
  gross_minutes: number | null
  gross_pay: number | null
  true_shift_cost: number | null
  applicable_rate: number | null
  break_minutes: number | null
  arrived_late_min: number | null
  left_early_min: number | null
  status: string
  approved_by: string | null
  approved_at: string | null
  manager_note: string | null
  staff: { name: string; employment_type: string; base_hourly_rate: number | null }
  clock_in: ClockEvent | null
  clock_out: ClockEvent | null
}

function toPerth(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function GpsDetail({ event, label }: { event: ClockEvent | null; label: string }) {
  if (!event) return null
  const score = event.trust_score ?? 0
  const colour = score >= 80 ? 'text-green-700' : score >= 50 ? 'text-yellow-700' : 'text-red-700'
  const bg     = score >= 80 ? 'bg-green-50' : score >= 50 ? 'bg-yellow-50' : 'bg-red-50'
  return (
    <div className={`rounded-lg p-3 text-xs space-y-1 ${bg}`}>
      <div className="font-semibold text-gray-700">{label}</div>
      <div>Raw: {toPerth(event.raw_time)}</div>
      <div>Paid: {toPerth(event.paid_time)}</div>
      <div>Snap: <span className="font-mono">{event.snap_reason}</span></div>
      {event.gps_lat && (
        <div>📍 {event.gps_lat}, {event.gps_lng}
          {event.gps_valid === false && <span className="text-red-600 ml-1">⚠ Outside zone</span>}
        </div>
      )}
      <div className={`font-bold ${colour}`}>Trust: {score}%</div>
      {event.flags && event.flags.length > 0 && (
        <div className="text-orange-600">🚩 {event.flags.join(', ')}</div>
      )}
    </div>
  )
}

export default function DayDetailPage() {
  const { date }     = useParams<{ date: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const focusId      = searchParams.get('shift')

  const [shifts, setShifts]                   = useState<Shift[]>([])
  const [selected, setSelected]               = useState<Shift | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [overrideHrs, setOverrideHrs]         = useState('')
  const [overrideQtr, setOverrideQtr]         = useState('0')
  const [overrideReason, setOverrideReason]   = useState('')
  const [managerNote, setManagerNote]         = useState('')
  const [saving, setSaving]                   = useState(false)
  const [msg, setMsg]                         = useState<string | null>(null)

  const [myUserId, setMyUserId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/my-role')
      .then(r => r.json())
      .then(j => setMyUserId(j.user_id ?? null))
  }, [])

  useEffect(() => {
    fetch(`/api/admin/shifts?from=${date}&to=${date}`)
      .then(r => r.json())
      .then(j => {
        const list: Shift[] = j.shifts ?? []
        setShifts(list)
        if (focusId) setSelected(list.find(s => s.id === focusId) ?? list[0] ?? null)
        else if (list.length > 0) setSelected(list[0])
        setLoading(false)
      })
  }, [date, focusId])

  const selectShift = (shift: Shift) => {
    setSelected(shift)
    setMsg(null)
    setOverrideHrs('')
    setOverrideQtr('0')
    setOverrideReason('')
    setManagerNote(shift.manager_note ?? '')
  }

  const approve = async () => {
    if (!selected || !myUserId) return
    setSaving(true)
    setMsg(null)
    const res = await fetch(`/api/admin/shifts/${selected.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by_id: myUserId }),
    })
    const j = await res.json()
    if (res.ok) {
      setMsg('✅ Shift approved')
      const updated = { ...selected, ...j.shift, staff: selected.staff }
      setSelected(updated)
      setShifts(prev => prev.map(s => s.id === updated.id ? updated : s))
    } else {
      setMsg(`❌ ${j.error}`)
    }
    setSaving(false)
  }

  const override = async () => {
    const totalMins = (parseInt(overrideHrs || '0') * 60) + parseInt(overrideQtr)
    if (!selected || !totalMins || !overrideReason || !myUserId) return
    setSaving(true)
    setMsg(null)
    const res = await fetch(`/api/admin/shifts/${selected.id}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        override_paid_minutes: totalMins,
        reason: overrideReason,
        approved_by_id: myUserId,
      }),
    })
    const j = await res.json()
    if (res.ok) {
      setMsg('✅ Override saved')
      const updated = { ...selected, ...j.shift, staff: selected.staff }
      setSelected(updated)
      setShifts(prev => prev.map(s => s.id === updated.id ? updated : s))
      setOverrideHrs('')
      setOverrideQtr('0')
      setOverrideReason('')
    } else {
      setMsg(`❌ ${j.error}`)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/hours')}
          className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-xl font-bold text-gray-900">
          Shifts — {date} (Perth)
        </h1>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No shifts for {date}</div>
      ) : (
        <div className="grid md:grid-cols-5 gap-5">

          {/* Shift list — 2 cols */}
          <div className="md:col-span-2 space-y-2">
            {shifts.map(shift => (
              <button key={shift.id} onClick={() => selectShift(shift)}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  selected?.id === shift.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 bg-white'
                }`}>
                <div className="font-semibold text-gray-900">{shift.staff.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {toPerth(shift.effective_start)} → {toPerth(shift.effective_end)}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                    {shift.paid_hours?.toFixed(2) ?? '?'} hrs
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    shift.status === 'approved'  ? 'bg-green-100 text-green-700' :
                    !shift.effective_end         ? 'bg-yellow-100 text-yellow-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {shift.status}
                  </span>
                  {shift.arrived_late_min != null && shift.arrived_late_min > 0 && (
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded">
                      {shift.arrived_late_min}m late
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel — 3 cols */}
          {selected && (
            <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 p-5 space-y-5">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{selected.staff.name}</h2>
                <div className="text-xs text-gray-500 capitalize">{selected.staff.employment_type}</div>
              </div>

              {msg && (
                <div className={`text-sm px-3 py-2 rounded ${
                  msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{msg}</div>
              )}

              {/* Pay summary */}
              <div className="grid grid-cols-4 gap-2 bg-gray-50 rounded-lg p-3 text-center text-sm">
                              {[
                  { label: 'Paid Hrs',  value: selected.paid_hours != null ? selected.paid_hours.toFixed(2) : '—' },
                  { label: 'Gross',     value: selected.gross_pay != null ? `$${Number(selected.gross_pay).toFixed(2)}` : '—' },
                  { label: 'True Cost', value: selected.true_shift_cost != null ? `$${Number(selected.true_shift_cost).toFixed(2)}` : '—' },
                  { label: 'Rate',      value: selected.applicable_rate != null ? `$${Number(selected.applicable_rate).toFixed(2)}` : '—' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className="font-bold text-gray-900">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Times breakdown */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Effective Start</div>
                  <div className="font-medium">{toPerth(selected.effective_start)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Effective End</div>
                  <div className="font-medium">{toPerth(selected.effective_end)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Break</div>
                  <div className="font-medium">{selected.break_minutes ?? 0} min</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Gross Minutes</div>
                  <div className="font-medium">{selected.gross_minutes ?? '—'}</div>
                </div>
              </div>

              {/* GPS detail */}
              <div className="grid grid-cols-2 gap-3">
                <GpsDetail event={selected.clock_in}  label="🟢 Clock In" />
                <GpsDetail event={selected.clock_out} label="🔴 Clock Out" />
              </div>

              {/* Manager note */}
              {selected.manager_note && (
                <div className="text-xs bg-blue-50 text-blue-700 rounded p-3">
                  📝 {selected.manager_note}
                </div>
              )}

              {/* Actions */}
              {selected.status !== 'approved' && selected.effective_end && (
                <div className="space-y-4 border-t pt-4">
                  <button onClick={approve} disabled={saving || !myUserId}
                    className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {saving ? 'Saving…' : '✅ Approve Shift'}
                  </button>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Override Paid Time
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Hours</label>
                        <input type="number" min="0" max="24" placeholder="e.g. 7"
                          value={overrideHrs}
                          onChange={e => setOverrideHrs(e.target.value)}
                          className="w-full border rounded px-3 py-1.5 text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Minutes</label>
                        <select value={overrideQtr} onChange={e => setOverrideQtr(e.target.value)}
                          className="w-full border rounded px-3 py-1.5 text-sm mt-0.5">
                          <option value="0">:00</option>
                          <option value="15">:15</option>
                          <option value="30">:30</option>
                          <option value="45">:45</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Reason</label>
                        <input type="text" placeholder="e.g. Left early"
                          value={overrideReason}
                          onChange={e => setOverrideReason(e.target.value)}
                          className="w-full border rounded px-3 py-1.5 text-sm mt-0.5" />
                      </div>
                    </div>
                    <button onClick={override}
                      disabled={saving || (!overrideHrs && overrideQtr === '0') || !overrideReason || !myUserId}
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                      Save Override
                    </button>
                  </div>
                </div>
              )}

              {selected.status === 'approved' && (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3">
                  ✅ Approved at {toPerth(selected.approved_at)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}