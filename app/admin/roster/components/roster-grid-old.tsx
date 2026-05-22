// app/admin/roster/components/roster-grid.tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Copy, Calendar, Users } from 'lucide-react'

interface StaffMember {
  id:                   string
  name:                 string
  employment_type:      string
  primary_department:   string
  secondary_department: string | null
  break_minutes:        number
  base_hourly_rate:     number | null
  salary_weekly:        number | null
  true_hourly_cost:     number | null
}

interface RosterEntry {
  id:              string
  staff_id:        string
  work_date:       string
  section:         number
  department:      string
  scheduled_start: string | null
  scheduled_end:   string | null
  employment_type: string
  day_type:        string
  status:          string
  break_minutes:   number
  true_hourly_cost: number | null
  manager_note:    string | null
  public_holiday_name: string | null
}

interface Props {
  staff:      StaffMember[]
  entries:    RosterEntry[]
  weekStart:  string
  weekDates:  string[]
  prevWeek:   string
  nextWeek:   string
}

const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEPT_COLOURS: Record<string, string> = {
  production: 'bg-amber-100 text-amber-800 border-amber-300',
  shop:       'bg-blue-100 text-blue-800 border-blue-300',
  delivery:   'bg-green-100 text-green-800 border-green-300',
  admin:      'bg-gray-100 text-gray-800 border-gray-300',
  management: 'bg-purple-100 text-purple-800 border-purple-300',
}
const STATUS_COLOURS: Record<string, string> = {
  scheduled:   'bg-white',
  present:     'bg-green-50',
  completed:   'bg-green-100',
  absent:      'bg-red-100',
  rostered_off:'bg-gray-100',
  leave:       'bg-blue-50',
}

function fmtTime(t: string | null): string {
  if (!t) return '—'
  return t.slice(0, 5)
}

function estimatedHours(entry: RosterEntry): number {
  if (!entry.scheduled_start || !entry.scheduled_end) return 0
  const [sh, sm] = entry.scheduled_start.split(':').map(Number)
  const [eh, em] = entry.scheduled_end.split(':').map(Number)
  const grossMins = (eh * 60 + em) - (sh * 60 + sm)
  const paidMins  = Math.max(0, grossMins - (entry.break_minutes ?? 0))
  return Math.round((paidMins / 60) * 100) / 100
}

export default function RosterGrid({
  staff, entries, weekStart, weekDates, prevWeek, nextWeek,
}: Props) {
  const router  = useRouter()
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>(entries)
  const [copying,      setCopying]      = useState(false)
  const [copyResult,   setCopyResult]   = useState<string | null>(null)
  const [editCell,     setEditCell]     = useState<{
    staffId: string; date: string; section: number; entry: RosterEntry | null
  } | null>(null)
  const [editForm,     setEditForm]     = useState<any>(null)
  const [saving,       setSaving]       = useState(false)

  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekDates[6] + 'T00:00:00')
    return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  })()

  // ── Get entry for a specific staff+date+section ───────────────────────────
  function getEntry(staffId: string, date: string, section = 1): RosterEntry | null {
    return localEntries.find(
      e => e.staff_id === staffId && e.work_date === date && e.section === section
    ) ?? null
  }

  // ── Week summary calculations ─────────────────────────────────────────────
  function staffWeekHours(staffId: string): number {
    return localEntries
      .filter(e => e.staff_id === staffId && e.status !== 'rostered_off')
      .reduce((sum, e) => sum + estimatedHours(e), 0)
  }

  function staffWeekCost(s: StaffMember): number {
    if (s.employment_type === 'salary') {
      const daysWorked = localEntries.filter(
        e => e.staff_id === s.id && e.status !== 'rostered_off' && e.status !== 'leave'
      ).length
      return daysWorked > 0 ? Number(s.salary_weekly ?? 0) : 0
    }
    const hrs = staffWeekHours(s.id)
    return Math.round(hrs * Number(s.true_hourly_cost ?? 0) * 100) / 100
  }

  function dayTotalCost(date: string): number {
    return staff.reduce((sum, s) => {
      const e = getEntry(s.id, date)
      if (!e || e.status === 'rostered_off') return sum
      if (s.employment_type === 'salary') return sum + Number(s.salary_weekly ?? 0) / 5
      const hrs = estimatedHours(e)
      return sum + hrs * Number(s.true_hourly_cost ?? 0)
    }, 0)
  }

  const totalWeeklyCost = staff.reduce((sum, s) => sum + staffWeekCost(s), 0)

  // ── Copy last week ────────────────────────────────────────────────────────
  async function handleCopyLastWeek() {
    if (!confirm(`Copy last week's roster to ${weekLabel}?\n\nExisting entries will be overwritten.`)) return
    setCopying(true)
    setCopyResult(null)
    try {
      const res  = await fetch('/api/admin/roster/copy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ from_week_start: prevWeek, to_week_start: weekStart }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCopyResult(`✅ Copied ${data.copied} entries from last week`)
        router.refresh()
      } else {
        setCopyResult(`❌ ${data.error ?? 'Copy failed'}`)
      }
    } catch (e: any) {
      setCopyResult(`❌ ${e.message}`)
    } finally {
      setCopying(false)
    }
  }

  // ── Open edit modal ───────────────────────────────────────────────────────
  function openEdit(staffMember: StaffMember, date: string, section = 1) {
    const entry = getEntry(staffMember.id, date, section)
    const dow   = new Date(date + 'T00:00:00').getDay()
    setEditCell({ staffId: staffMember.id, date, section, entry })
    setEditForm({
      staff_id:        staffMember.id,
      work_date:       date,
      section,
      department:      entry?.department      ?? staffMember.primary_department,
      scheduled_start: entry?.scheduled_start ?? '',
      scheduled_end:   entry?.scheduled_end   ?? '',
      day_type:        entry?.day_type        ?? (dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'normal'),
      public_holiday_name: entry?.public_holiday_name ?? '',
      manager_note:    entry?.manager_note    ?? '',
      status:          entry?.status          ?? 'scheduled',
    })
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!editCell || !editForm) return
    setSaving(true)
    try {
      if (editCell.entry) {
        // Update existing
        const res  = await fetch(`/api/admin/roster/${editCell.entry.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(editForm),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => prev.map(e => e.id === editCell.entry!.id ? data.entry : e))
        }
      } else {
        // Create new
        const res  = await fetch('/api/admin/roster/entry', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(editForm),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => [...prev, data.entry])
        }
      }
      setEditCell(null)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  // ── Mark rostered off ─────────────────────────────────────────────────────
  async function handleMarkOff() {
    if (!editCell?.entry) { setEditCell(null); return }
    setSaving(true)
    try {
      await fetch(`/api/admin/roster/${editCell.entry.id}`, { method: 'DELETE' })
      setLocalEntries(prev => prev.map(e =>
        e.id === editCell.entry!.id
          ? { ...e, status: 'rostered_off', day_type: 'rostered_off' }
          : e
      ))
      setEditCell(null)
    } finally {
      setSaving(false)
    }
  }

  const inp = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-amber-500"

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 max-w-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-7 w-7 text-amber-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Roster</h1>
            <p className="text-sm text-gray-500">{weekLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Week navigation */}
          <a href={`/admin/roster?week=${prevWeek}`}
            className="p-2 border rounded-lg hover:bg-gray-50">
            <ChevronLeft className="h-5 w-5" />
          </a>
          <a href={`/admin/roster?week=${nextWeek}`}
            className="p-2 border rounded-lg hover:bg-gray-50">
            <ChevronRight className="h-5 w-5" />
          </a>

          {/* Copy last week */}
          <button
            onClick={handleCopyLastWeek}
            disabled={copying}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-lg
                       text-sm font-medium hover:bg-amber-800 disabled:opacity-50">
            <Copy className="h-4 w-4" />
            {copying ? 'Copying...' : 'Copy Last Week'}
          </button>

          {/* Link to staff management */}
          <a href="/admin/staff"
            className="flex items-center gap-2 px-4 py-2 border rounded-lg
                       text-sm font-medium hover:bg-gray-50">
            <Users className="h-4 w-4" /> Staff
          </a>
        </div>
      </div>

      {/* Copy result message */}
      {copyResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          copyResult.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {copyResult}
          <button onClick={() => setCopyResult(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500">Staff Rostered</p>
          <p className="text-xl font-bold">{staff.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500">Est. Weekly Cost</p>
          <p className="text-xl font-bold text-amber-700">${totalWeeklyCost.toFixed(0)}</p>
          <p className="text-xs text-gray-400">incl. super + leave loading</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500">Total Shifts</p>
          <p className="text-xl font-bold">
            {localEntries.filter(e => e.status !== 'rostered_off').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500">Total Hours</p>
          <p className="text-xl font-bold">
            {localEntries
              .filter(e => e.status !== 'rostered_off')
              .reduce((s, e) => s + estimatedHours(e), 0)
              .toFixed(1)}h
          </p>
        </div>
      </div>

      {/* ── Roster Grid ── */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 w-40 sticky left-0 bg-gray-50 z-10">
                Staff
              </th>
              {weekDates.map((date, i) => {
                const isToday = date === new Date(
                  new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })
                ).toISOString().split('T')[0]
                const cost = dayTotalCost(date)
                return (
                  <th key={date} className={`px-2 py-2 text-center font-semibold min-w-[110px] ${
                    isToday ? 'bg-amber-50 text-amber-800' : 'text-gray-700'
                  }`}>
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-xs font-normal text-gray-500">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </div>
                    {cost > 0 && (
                      <div className="text-xs text-amber-600 font-medium">${cost.toFixed(0)}</div>
                    )}
                  </th>
                )
              })}
              <th className="px-3 py-3 text-right font-semibold text-gray-700 w-28">Week</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {staff.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No active staff — <a href="/admin/staff/new" className="text-blue-600 hover:underline">Add staff</a> first
                </td>
              </tr>
            )}

            {staff.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                {/* Staff name + dept */}
                <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r">
                  <p className="font-medium text-sm text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.primary_department}</p>
                  <p className="text-xs text-gray-400">
                    {s.employment_type === 'salary'
                      ? `$${Number(s.salary_weekly ?? 0).toFixed(0)}/wk`
                      : `$${Number(s.base_hourly_rate ?? 0).toFixed(2)}/hr`}
                  </p>
                </td>

                {/* One cell per day */}
                {weekDates.map((date, i) => {
                  const entry   = getEntry(s.id, date)
                  const isOff   = !entry || entry.status === 'rostered_off' || entry.day_type === 'rostered_off'
                  const isPH    = entry?.day_type === 'public_holiday'
                  const isToday = date === new Date(
                    new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })
                  ).toISOString().split('T')[0]

                  return (
                    <td
                      key={date}
                      onClick={() => openEdit(s, date)}
                      className={`px-2 py-1.5 text-center cursor-pointer border-l transition-colors
                        ${isToday ? 'bg-amber-50/40' : ''}
                        ${!isOff ? STATUS_COLOURS[entry?.status ?? 'scheduled'] : 'bg-gray-50'}
                        hover:ring-2 hover:ring-amber-400 hover:ring-inset`}
                    >
                      {isOff ? (
                        <span className="text-xs text-gray-300">OFF</span>
                      ) : (
                        <div className="space-y-0.5">
                          {isPH && (
                            <div className="text-[9px] bg-red-100 text-red-600 rounded px-1 truncate">
                              {entry?.public_holiday_name ?? 'PH'}
                            </div>
                          )}
                          <div className={`text-xs font-medium px-1 py-0.5 rounded border text-center
                            ${DEPT_COLOURS[entry?.department ?? 'production']}`}>
                            {entry?.department?.slice(0,4).toUpperCase()}
                          </div>
                          <div className="text-xs text-gray-700 font-mono">
                            {fmtTime(entry?.scheduled_start ?? null)}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {entry?.employment_type === 'fixed' || entry?.scheduled_end
                              ? fmtTime(entry?.scheduled_end ?? null)
                              : '→'}
                          </div>
                          <div className="text-[10px] text-amber-600">
                            {estimatedHours(entry!) > 0
                              ? `${estimatedHours(entry!).toFixed(1)}h`
                              : ''}
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}

                {/* Week total */}
                <td className="px-3 py-2 text-right border-l">
                  <p className="text-sm font-semibold">
                    {s.employment_type === 'salary'
                      ? '—'
                      : `${staffWeekHours(s.id).toFixed(1)}h`}
                  </p>
                  <p className="text-xs text-amber-700">
                    ${staffWeekCost(s).toFixed(0)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Footer totals row */}
          {staff.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold">
                <td className="px-4 py-2 text-sm sticky left-0 bg-gray-50">Daily Cost</td>
                {weekDates.map(date => (
                  <td key={date} className="px-2 py-2 text-center text-sm text-amber-700 border-l">
                    ${dayTotalCost(date).toFixed(0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-amber-700 border-l">
                  ${totalWeeklyCost.toFixed(0)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Edit Cell Modal ── */}
      {editCell && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b">
              <h2 className="font-bold text-gray-900">
                {staff.find(s => s.id === editCell.staffId)?.name}
              </h2>
              <p className="text-sm text-gray-500">
                {new Date(editCell.date + 'T00:00:00').toLocaleDateString('en-AU', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </p>
            </div>

            <div className="p-5 space-y-3">
              {/* Department */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select value={editForm.department}
                  onChange={e => setEditForm((p: any) => ({ ...p, department: e.target.value }))}
                  className={inp}>
                  <option value="production">🍞 Production</option>
                  <option value="shop">🛒 Shop</option>
                  <option value="delivery">🚚 Delivery</option>
                  <option value="admin">📋 Admin</option>
                  <option value="management">👔 Management</option>
                </select>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                  <input type="time" value={editForm.scheduled_start}
                    onChange={e => setEditForm((p: any) => ({ ...p, scheduled_start: e.target.value }))}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Finish
                    {editForm.employment_type === 'fixed_start' && (
                      <span className="ml-1 text-gray-400">(optional)</span>
                    )}
                  </label>
                  <input type="time" value={editForm.scheduled_end}
                    onChange={e => setEditForm((p: any) => ({ ...p, scheduled_end: e.target.value }))}
                    className={inp} />
                </div>
              </div>

              {/* Day type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Day Type</label>
                <select value={editForm.day_type}
                  onChange={e => setEditForm((p: any) => ({ ...p, day_type: e.target.value }))}
                  className={inp}>
                  <option value="normal">Normal</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                  <option value="public_holiday">Public Holiday</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              {/* PH name (only if PH) */}
              {editForm.day_type === 'public_holiday' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Holiday Name</label>
                  <input type="text" value={editForm.public_holiday_name}
                    onChange={e => setEditForm((p: any) => ({ ...p, public_holiday_name: e.target.value }))}
                    className={inp} placeholder="e.g. Easter Monday" />
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                <input type="text" value={editForm.manager_note}
                  onChange={e => setEditForm((p: any) => ({ ...p, manager_note: e.target.value }))}
                  className={inp} placeholder="Optional note..." />
              </div>
            </div>

            <div className="p-5 border-t flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium
                           hover:bg-amber-800 disabled:opacity-50">
                {saving ? 'Saving...' : editCell.entry ? 'Update' : 'Add Shift'}
              </button>
              {editCell.entry && (
                <button onClick={handleMarkOff} disabled={saving}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                  Mark OFF
                </button>
              )}
              <button onClick={() => setEditCell(null)} disabled={saving}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}