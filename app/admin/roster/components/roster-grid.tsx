
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Copy, Users, X, Trash2 } from 'lucide-react'

interface StaffMember {
  id: string
  name: string
  employment_type: string
  primary_department: string
  secondary_department: string | null
  break_minutes: number
  base_hourly_rate: number | null
  salary_weekly: number | null
  true_hourly_cost: number | null
}

interface RosterEntry {
  id: string
  staff_id: string
  work_date: string
  section: number
  department: string
  scheduled_start: string | null
  scheduled_end: string | null
  employment_type: string
  day_type: string
  status: string
  break_minutes: number
  true_hourly_cost: number | null
  manager_note: string | null
  public_holiday_name: string | null
}

interface ActualShift {
  id: string
  staff_id: string
  work_date: string
  section: number
  effective_start: string | null
  effective_end: string | null
  arrived_late_min: number | null
  left_early_min: number | null
  status: string
  paid_hours: number | null
  gross_pay: number | null
}

interface Props {
  staff: StaffMember[]
  entries: RosterEntry[]
  shifts: ActualShift[]
  weekStart: string
  weekDates: string[]
  prevWeek: string
  nextWeek: string
}
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_START = 4
const HOUR_END = 22
const TOTAL_HOURS = HOUR_END - HOUR_START
const SLOTS_PER_HOUR = 4
const TOTAL_SLOTS = TOTAL_HOURS * SLOTS_PER_HOUR
const SLOT_WIDTH = 14
const TIMELINE_WIDTH = TOTAL_SLOTS * SLOT_WIDTH
const STAFF_COL_WIDTH = 140
const WEEK_COL_WIDTH = 80
const ACTUAL_COL_WIDTH = 80
const ROW_HEIGHT = 52
const MAX_SECTIONS = 2

const DEPT_COLOURS: Record<string, { bg: string; barBg: string }> = {
  production: { bg: 'bg-amber-500', barBg: '#f59e0b' },
  shop:       { bg: 'bg-blue-500',  barBg: '#3b82f6' },
  delivery:   { bg: 'bg-green-500', barBg: '#22c55e' },
  admin:      { bg: 'bg-gray-500',  barBg: '#6b7280' },
  management: { bg: 'bg-purple-500', barBg: '#a855f7' },
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
    return Math.max(0, Math.min(TOTAL_SLOTS, ((h * 60 + m) - HOUR_START * 60) / 15))
  }

function slotToTime(slot: number): string {
  const totalMinutes = (HOUR_START * 60) + (slot * 15)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function slotToLabel(slot: number): string {
  const totalMinutes = (HOUR_START * 60) + (slot * 15)
  const h = Math.floor(totalMinutes / 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${ampm}`
}

function estimatedHours(entry: RosterEntry): number {
  if (!entry.scheduled_start || !entry.scheduled_end) return 0
  const [sh, sm] = entry.scheduled_start.split(':').map(Number)
  const [eh, em] = entry.scheduled_end.split(':').map(Number)
  const grossMins = (eh * 60 + em) - (sh * 60 + sm)
  const breakMins = grossMins >= 270 ? (entry.break_minutes ?? 0) : 0
  return Math.round((Math.max(0, grossMins - breakMins)) / 60 * 100) / 100
}

function fmtTimeShort(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`
}

export default function RosterGrid({ staff, entries, shifts, weekStart, weekDates, prevWeek, nextWeek }: Props) {
const router = useRouter()
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>(entries)
  const [activeDay, setActiveDay] = useState<number>(() => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toISOString().split('T')[0]
    const idx = weekDates.indexOf(today)
    return idx >= 0 ? idx : 1
  })
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showActuals, setShowActuals] = useState(false)
   const [showPrint, setShowPrint] = useState(false)
  const [dragState, setDragState] = useState<{
    type: 'create' | 'move' | 'resize-left' | 'resize-right'
    staffId: string; startSlot: number; currentSlot: number
    entryId?: string; originalStart?: number; originalEnd?: number
  } | null>(null)
  const [editEntry, setEditEntry] = useState<{ entry: RosterEntry | null; staffId: string; date: string } | null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const currentDate = weekDates[activeDay]
  const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toISOString().split('T')[0]

  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekDates[6] + 'T00:00:00')
    return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  })()

  function getEntries(staffId: string, date: string): RosterEntry[] {
    return localEntries.filter(e => e.staff_id === staffId && e.work_date === date && e.status !== 'rostered_off').sort((a, b) => (a.section ?? 1) - (b.section ?? 1))
  }
   function getActualShifts(staffId: string, date: string): ActualShift[] {
    return shifts.filter(s => s.staff_id === staffId && s.work_date === date && s.effective_start)
      .sort((a, b) => (a.section ?? 1) - (b.section ?? 1))
  }
  function actualTimeToSlot(timestamp: string): number {
    const d = new Date(timestamp)
    // Get Perth time using Intl formatter — reliable across all environments
    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const parts = formatter.formatToParts(d)
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
    return Math.max(0, Math.min(TOTAL_SLOTS, ((h * 60 + m) - HOUR_START * 60) / 30))
  }
  function isRosteredOff(staffId: string, date: string): boolean {
    return localEntries.some(e => e.staff_id === staffId && e.work_date === date && e.status === 'rostered_off')
  }
  function staffDayHours(staffId: string, date: string): number {
    return getEntries(staffId, date).reduce((sum, e) => sum + estimatedHours(e), 0)
  }
  function staffWeekHours(staffId: string): number {
    return weekDates.reduce((sum, d) => sum + staffDayHours(staffId, d), 0)
  }
  function staffWeekCost(s: StaffMember): number {
    if (s.employment_type === 'salary') {
      return weekDates.filter(d => getEntries(s.id, d).length > 0).length > 0 ? Number(s.salary_weekly ?? 0) : 0
    }
    return Math.round(staffWeekHours(s.id) * Number(s.true_hourly_cost ?? 0) * 100) / 100
  }
  const totalWeeklyCost = staff.reduce((sum, s) => sum + staffWeekCost(s), 0)
  const totalWeeklyHours = staff.reduce((sum, s) => sum + staffWeekHours(s.id), 0)
  function staffActualWeekHours(staffId: string): number {
    return weekDates.reduce((sum, d) => {
      const dayShifts = shifts.filter(s => s.staff_id === staffId && s.work_date === d && s.paid_hours)
      return sum + dayShifts.reduce((h, s) => h + Number(s.paid_hours ?? 0), 0)
    }, 0)
  }

  function staffActualWeekCost(s: StaffMember): number {
    if (s.employment_type === 'salary') {
      const hasActual = weekDates.some(d => shifts.some(sh => sh.staff_id === s.id && sh.work_date === d && sh.effective_start))
      return hasActual ? Number(s.salary_weekly ?? 0) : 0
    }
    return weekDates.reduce((sum, d) => {
      const dayShifts = shifts.filter(sh => sh.staff_id === s.id && sh.work_date === d && sh.gross_pay)
      return sum + dayShifts.reduce((c, sh) => c + Number(sh.gross_pay ?? 0), 0)
    }, 0)
  }

  const totalActualHours = staff.reduce((sum, s) => sum + staffActualWeekHours(s.id), 0)
  const totalActualCost = staff.reduce((sum, s) => sum + staffActualWeekCost(s), 0)
  async function handleCopyLastWeek() {
    if (!confirm(`Copy last week's roster to ${weekLabel}?\nExisting entries will be overwritten.`)) return
    setCopying(true); setCopyResult(null)
    try {
      const res = await fetch('/api/admin/roster/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_week_start: prevWeek, to_week_start: weekStart }) })
      const data = await res.json()
      if (res.ok && data.success) { setCopyResult(`Copied ${data.copied} entries`); router.refresh() }
      else setCopyResult(`Error: ${data.error ?? 'Copy failed'}`)
    } catch (e: any) { setCopyResult(`Error: ${e.message}`) }
    finally { setCopying(false) }
  }
  async function handleApplyTemplate() {
    if (!confirm(`Apply staff templates to ${weekLabel}?\n\nThis will overwrite existing entries with template times.`)) return
    setCopying(true)
    setCopyResult(null)
    try {
      const res = await fetch('/api/admin/roster/apply-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCopyResult(`Applied ${data.created} template entries`)
        router.refresh()
      } else {
        setCopyResult(`Error: ${data.error ?? data.message ?? 'Failed'}`)
      }
    } catch (e: any) {
      setCopyResult(`Error: ${e.message}`)
    } finally {
      setCopying(false)
    }
  }
  const saveEntry = useCallback(async (staffId: string, date: string, startTime: string, endTime: string, existingId?: string) => {
    setSaving(true)
    try {
      if (existingId) {
        const res = await fetch(`/api/admin/roster/${existingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduled_start: startTime, scheduled_end: endTime }) })
        const data = await res.json()
        if (res.ok) setLocalEntries(prev => prev.map(e => e.id === existingId ? data.entry : e))
      } else {
        const existing = localEntries.filter(e => e.staff_id === staffId && e.work_date === date && e.status !== 'rostered_off')
        const usedSections = existing.map(e => e.section)
        let useSection = 1
        for (let s = 1; s <= MAX_SECTIONS; s++) { if (!usedSections.includes(s)) { useSection = s; break } }
        const res = await fetch('/api/admin/roster/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: staffId, work_date: date, section: useSection, scheduled_start: startTime, scheduled_end: endTime }) })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(e => e.staff_id === staffId && e.work_date === date && e.section === useSection)
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
    } catch (e) { console.error('Save failed', e) }
    finally { setSaving(false) }
  }, [localEntries])

  async function handleDelete(entryId: string) {
    setSaving(true)
    try { await fetch(`/api/admin/roster/${entryId}`, { method: 'DELETE' }); setLocalEntries(prev => prev.filter(e => e.id !== entryId)) }
    finally { setSaving(false); setEditEntry(null) }
  }

  const getSlotFromX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(TOTAL_SLOTS, Math.round((clientX - rect.left + timelineRef.current.scrollLeft) / SLOT_WIDTH)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, staffId: string, type: 'create' | 'move' | 'resize-left' | 'resize-right', entryId?: string, originalStart?: number, originalEnd?: number) => {
    e.preventDefault(); e.stopPropagation()
    setDragState({ type, staffId, startSlot: getSlotFromX(e.clientX), currentSlot: getSlotFromX(e.clientX), entryId, originalStart, originalEnd })
  }, [getSlotFromX])

  useEffect(() => {
    if (!dragState) return
    const handleMouseMove = (e: MouseEvent) => { setDragState(prev => prev ? { ...prev, currentSlot: getSlotFromX(e.clientX) } : null) }
    const handleMouseUp = async () => {
      if (!dragState) return
      const { type, staffId, startSlot, currentSlot, entryId, originalStart, originalEnd } = dragState
      setDragState(null)

      // If it was a "move" but didn't actually move — treat as click → open edit
      if (type === 'move' && startSlot === currentSlot && entryId) {
        const staffMember = staff.find(s => s.id === staffId)
        const entry = localEntries.find(e => e.id === entryId)
        if (staffMember && entry) {
          openEditModal(staffMember, entry)
          return
        }
      }

      let fs: number, fe: number
      if (type === 'create') { fs = Math.min(startSlot, currentSlot); fe = Math.max(startSlot, currentSlot); if (fe - fs < 1) fe = fs + 2 }
      else if (type === 'move') { const d = currentSlot - startSlot; fs = (originalStart ?? 0) + d; fe = (originalEnd ?? 0) + d; if (fs < 0) { fe -= fs; fs = 0 }; if (fe > TOTAL_SLOTS) { fs -= (fe - TOTAL_SLOTS); fe = TOTAL_SLOTS } }
      else if (type === 'resize-left') { fs = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1); fe = originalEnd ?? TOTAL_SLOTS }
      else { fs = originalStart ?? 0; fe = Math.max(currentSlot, (originalStart ?? 0) + 1) }
      fs = Math.max(0, Math.min(TOTAL_SLOTS - 1, fs)); fe = Math.max(fs + 1, Math.min(TOTAL_SLOTS, fe))
      await saveEntry(staffId, currentDate, slotToTime(fs), slotToTime(fe), entryId)
    }
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [dragState, currentDate, getSlotFromX, saveEntry])

  function getBarForEntry(entry: RosterEntry): { left: number; width: number } | null {
    if (!entry.scheduled_start || !entry.scheduled_end) return null
    const s = timeToSlot(entry.scheduled_start), e = timeToSlot(entry.scheduled_end)
    return { left: s * SLOT_WIDTH, width: Math.max((e - s) * SLOT_WIDTH, SLOT_WIDTH) }
  }

  function getDragPreview(): { staffId: string; left: number; width: number } | null {
    if (!dragState) return null
    const { type, staffId, startSlot, currentSlot, originalStart, originalEnd } = dragState
    let s: number, e: number
    if (type === 'create') { s = Math.min(startSlot, currentSlot); e = Math.max(startSlot, currentSlot); if (e - s < 1) e = s + 2 }
    else if (type === 'move') { const d = currentSlot - startSlot; s = (originalStart ?? 0) + d; e = (originalEnd ?? 0) + d }
    else if (type === 'resize-left') { s = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1); e = originalEnd ?? TOTAL_SLOTS }
    else { s = originalStart ?? 0; e = Math.max(currentSlot, (originalStart ?? 0) + 1) }
    s = Math.max(0, s); e = Math.min(TOTAL_SLOTS, e)
    return { staffId, left: s * SLOT_WIDTH, width: Math.max((e - s) * SLOT_WIDTH, SLOT_WIDTH) }
  }

  function openEditModal(sm: StaffMember, entry: RosterEntry | null) {
    const dow = new Date(currentDate + 'T00:00:00').getDay()
    setEditEntry({ entry, staffId: sm.id, date: currentDate })
    setEditForm({ scheduled_start: entry?.scheduled_start ?? '06:00', scheduled_end: entry?.scheduled_end ?? '14:00', department: entry?.department ?? sm.primary_department, day_type: entry?.day_type ?? (dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'normal'), public_holiday_name: entry?.public_holiday_name ?? '', manager_note: entry?.manager_note ?? '' })
  }

  async function handleSaveModal() {
    if (!editEntry || !editForm) return
    setSaving(true)
    try {
      if (editEntry.entry) {
        const res = await fetch(`/api/admin/roster/${editEntry.entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
        const data = await res.json()
        if (res.ok) setLocalEntries(prev => prev.map(e => e.id === editEntry.entry!.id ? data.entry : e))
      } else {
        const existing = localEntries.filter(e => e.staff_id === editEntry.staffId && e.work_date === editEntry.date && e.status !== 'rostered_off')
        let useSection = 1
        for (let s = 1; s <= MAX_SECTIONS; s++) { if (!existing.map(e => e.section).includes(s)) { useSection = s; break } }
        const res = await fetch('/api/admin/roster/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: editEntry.staffId, work_date: editEntry.date, section: useSection, ...editForm }) })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(e => e.staff_id === editEntry.staffId && e.work_date === editEntry.date && e.section === useSection)
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
      setEditEntry(null)
    } finally { setSaving(false) }
  }

  const dragPreview = getDragPreview()
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500'

    return (
    <div className="fixed inset-0 flex flex-col bg-stone-50 z-40">

      {/* ── Header Row 1: Title + Navigation ── */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-white border-b flex-shrink-0 shadow-sm">
        <a href="/admin" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </a>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">📅 Roster</span>
          <span className="text-xs text-gray-400 hidden sm:inline">
            {weekLabel}
          </span>
        </div>

        <div className="flex-1" />

        {/* Week navigation */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5">
          <a href={`/admin/roster?week=${prevWeek}`} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all">
            <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
          </a>
          <span className="text-xs font-medium text-gray-600 px-1">Week</span>
          <a href={`/admin/roster?week=${nextWeek}`} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all">
            <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
          </a>
        </div>

        <button onClick={handleCopyLastWeek} disabled={copying}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors shadow-sm">
          <Copy className="h-3 w-3" />
          {copying ? 'Copying…' : 'Copy Last Week'}
        </button>
        <button onClick={handleApplyTemplate} disabled={copying}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
          {copying ? '…' : 'From Template'}
        </button>
        <a href="/admin/staff" className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <Users className="h-3 w-3" />Staff
        </a>
               <button onClick={() => setShowPrint(true)}
          className="px-3 py-1.5 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          🖨️ Print
        </button>
        <button onClick={() => setShowActuals(prev => !prev)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showActuals ? 'bg-green-600 text-white' : 'border text-gray-600 hover:bg-gray-50'
          }`}>
          {showActuals ? '🟢 Actuals ON' : '⚪ Actuals'}
        </button>
        {saving && <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />}
      </div>

      {/* ── Header Row 2: Day Tabs + Stats ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b flex-shrink-0">
        {weekDates.map((date, i) => {
          const isToday = date === todayStr
          const isActive = i === activeDay
          const dayDate = new Date(date + 'T00:00:00')
          return (
            <button key={date} onClick={() => setActiveDay(i)}
              className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                isActive
                  ? 'bg-amber-700 text-white shadow-md'
                  : isToday
                    ? 'bg-amber-50 text-amber-800 ring-2 ring-amber-300'
                    : 'text-gray-500 hover:bg-gray-50'
              }`}>

              <div className="text-sm font-bold">{DAY_LABELS[i]}</div>
              <div className={`text-xs ${isActive ? 'text-amber-200' : 'text-gray-400'}`}>
                {dayDate.getDate()}
              </div>
            </button>
          )
        })}
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <div className="text-center px-2">
      
                <div className="text-xs text-gray-400">Week</div>
          <div className="text-sm font-bold text-gray-900">{totalWeeklyHours.toFixed(1)}h</div>
          <div className="text-xs text-amber-600 font-medium">${totalWeeklyCost.toFixed(0)}</div>
        </div>
      </div>

      {/* Copy result */}
      {copyResult && (
        <div className={`px-3 py-1.5 text-xs flex-shrink-0 flex items-center justify-between ${
          copyResult.includes('Copied') ? 'bg-green-50 text-green-700 border-b border-green-200' : 'bg-red-50 text-red-700 border-b border-red-200'
        }`}>
          <span>{copyResult}</span>
          <button onClick={() => setCopyResult(null)} className="ml-2 hover:opacity-60">✕</button>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Staff names */}
        <div className="flex-shrink-0 bg-white border-r overflow-hidden" style={{ width: STAFF_COL_WIDTH }}>
          <div className="h-8 border-b bg-gray-50 flex items-center px-3">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Staff</span>
          </div>
          {staff.map((s, idx) => {
            const dept = DEPT_COLOURS[s.primary_department] ?? DEPT_COLOURS.admin
            return (
              <div key={s.id} className={`border-b flex items-center px-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                style={{ height: ROW_HEIGHT }}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{s.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${dept.bg}`} />
                    <span className="text-[10px] text-gray-400 capitalize">{s.primary_department}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={timelineRef}>
          <div style={{ width: TIMELINE_WIDTH, minWidth: '100%' }}>
            {/* Hour headers */}
            <div className="h-8 border-b bg-gray-50 flex">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div key={i} className="flex-shrink-0 border-l border-gray-200 flex items-end px-1 pb-0.5"
                  style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }}>
                  <span className="text-[10px] text-gray-400 font-medium">{slotToLabel(i * SLOTS_PER_HOUR)}</span>
                </div>
              ))}
            </div>

            {/* Staff rows */}
            {staff.map((s, idx) => {
              const staffEntries = getEntries(s.id, currentDate)
              const off = isRosteredOff(s.id, currentDate)
              const dept = DEPT_COLOURS[s.primary_department] ?? DEPT_COLOURS.admin
              const showDrag = dragPreview && dragPreview.staffId === s.id
              return (
                <div key={s.id} className={`border-b relative group ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                  style={{ height: ROW_HEIGHT }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-bar]')) return
                    if (!off && staffEntries.length < MAX_SECTIONS) handleMouseDown(e, s.id, 'create')
                  }}
                  onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('[data-bar]')) openEditModal(s, null) }}>

                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div key={i} className="flex-shrink-0 border-l border-gray-100/80" style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }} />
                    ))}
                  </div>

                  {/* Current time line */}
                  {currentDate === todayStr && (() => {
                    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
                    const ns = timeToSlot(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
                    return ns > 0 && ns < TOTAL_SLOTS ? (
                      <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: ns * SLOT_WIDTH - 1 }}>
                        <div className="w-0.5 h-full bg-red-400" />
                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-400 rounded-full" />
                      </div>
                    ) : null
                  })()}

                  {/* Shift bars */}
                  {!off && !showDrag && staffEntries.map(entry => {
                    const bar = getBarForEntry(entry)
                    if (!bar) return null
                    const eDept = DEPT_COLOURS[entry.department ?? s.primary_department] ?? DEPT_COLOURS.admin
                    return (
                      <div key={entry.id} data-bar="true"
                        className="absolute top-1.5 bottom-1.5 rounded-lg shadow-sm flex items-center cursor-move
                                   hover:shadow-md hover:brightness-110 select-none overflow-hidden transition-all"
                        style={{ left: bar.left, width: bar.width, backgroundColor: eDept.barBg }}
                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'move', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }}
                        onDoubleClick={(e) => { e.stopPropagation(); openEditModal(s, entry) }}>

                        <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-w-resize hover:bg-white/30 rounded-l-lg transition-colors"
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'resize-left', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }} />

                        <div className="flex-1 px-2 flex items-center gap-1.5 min-w-0 pointer-events-none">
                          <span className="text-[11px] font-bold text-white truncate drop-shadow-sm">
                            {fmtTimeShort(entry.scheduled_start!)}–{fmtTimeShort(entry.scheduled_end!)}
                          </span>
                          {bar.width > 90 && (
                            <span className="text-[10px] text-white/80 font-medium">{estimatedHours(entry).toFixed(1)}h</span>
                          )}
                          {bar.width > 160 && entry.department !== s.primary_department && (
                            <span className="text-[10px] text-white/60 capitalize">({entry.department})</span>
                          )}
                        </div>

                        <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-e-resize hover:bg-white/30 rounded-r-lg transition-colors"
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'resize-right', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }} />
                      </div>
                    )
                  })}

                  {/* Drag preview */}
                                    {/* Actual clock bars */}
                  {showActuals && !off && getActualShifts(s.id, currentDate).map(shift => {
                    if (!shift.effective_start) return null
                    const startSlot = actualTimeToSlot(shift.effective_start)
                    const endSlot = shift.effective_end ? actualTimeToSlot(shift.effective_end) : startSlot + 2
                    const left = startSlot * SLOT_WIDTH
                    const width = Math.max((endSlot - startSlot) * SLOT_WIDTH, SLOT_WIDTH / 2)
                    const isLate = (shift.arrived_late_min ?? 0) > 5
                    const isOpen = !shift.effective_end
                    const barColor = isOpen ? '#ef4444' : isLate ? '#f97316' : '#22c55e'
                    return (
                      <div key={`actual-${shift.id}`}
                        className="absolute rounded-sm pointer-events-none"
                        style={{
                          left, width, height: 6,
                          bottom: 2,
                          backgroundColor: barColor,
                          opacity: 0.9,
                        }}
                        title={`Actual: ${shift.effective_start ? new Date(shift.effective_start).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit' }) : '?'} – ${shift.effective_end ? new Date(shift.effective_end).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit' }) : 'still in'}${isLate ? ` (${shift.arrived_late_min}min late)` : ''}`}
                      />
                    )
                  })}
                  {showDrag && (
                    <div className="absolute top-1.5 bottom-1.5 rounded-lg border-2 border-dashed pointer-events-none z-10"
                      style={{ left: dragPreview.left, width: dragPreview.width, backgroundColor: `${dept.barBg}20`, borderColor: dept.barBg }}>
                      <div className="flex items-center h-full px-2">
                        <span className="text-[11px] font-bold" style={{ color: dept.barBg }}>
                          {slotToLabel(Math.round(dragPreview.left / SLOT_WIDTH))} – {slotToLabel(Math.round((dragPreview.left + dragPreview.width) / SLOT_WIDTH))}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* States */}
                  {off && <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] text-gray-400 italic bg-gray-100 px-2 py-0.5 rounded">Rostered Off</span></div>}
                  {staffEntries.length === 0 && !off && !showDrag && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-[10px] text-gray-300 bg-white/80 px-2 py-0.5 rounded">Click & drag to add shift</span>
                    </div>
                  )}
                  {staffEntries.length === 1 && !off && !showDrag && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-[9px] text-gray-300 bg-white/80 px-1.5 py-0.5 rounded">+ split</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Week totals */}
        <div className="flex-shrink-0 bg-white border-l overflow-hidden" style={{ width: WEEK_COL_WIDTH }}>
          <div className="h-8 border-b bg-gray-50 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Week</span>
          </div>
                {staff.map((s, idx) => (
            <div key={s.id} className={`border-b flex flex-col items-center justify-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
              style={{ height: ROW_HEIGHT }}>
              <span className="text-xs font-bold text-gray-900">{staffWeekHours(s.id).toFixed(1)}h</span>
              <span className="text-[10px] text-amber-600 font-medium">${staffWeekCost(s).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
        {/* Actual totals */}
        <div className="flex-shrink-0 bg-white border-l overflow-hidden" style={{ width: ACTUAL_COL_WIDTH }}>
          <div className="h-8 border-b bg-green-50 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wider">Actual</span>
          </div>
          {staff.map((s, idx) => {
            const hrs = staffActualWeekHours(s.id)
            const cost = staffActualWeekCost(s)
            const schedHrs = staffWeekHours(s.id)
            const diff = hrs - schedHrs
            return (
              <div key={s.id} className={`border-b flex flex-col items-center justify-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                style={{ height: ROW_HEIGHT }}>
                {hrs > 0 ? (
                  <>
                    <span className="text-xs font-bold text-gray-900">{hrs.toFixed(1)}h</span>
                    <span className={`text-[10px] font-medium ${diff > 0.25 ? 'text-red-500' : diff < -0.25 ? 'text-blue-500' : 'text-green-600'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}h
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-300">—</span>
                )}
              </div>
            )
          })}
        </div>
      {/* ── Footer Legend ── */}
      <div className="flex items-center px-3 py-1.5 bg-white border-t flex-shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-4">
          {Object.entries(DEPT_COLOURS).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: val.barBg }} />
              <span className="text-sm text-gray-500 capitalize">{key}</span>
            </span>
          ))}
        </div>
               {showActuals && (
          <div className="flex items-center gap-3 mx-4">
            <span className="text-[10px] text-gray-400">|</span>
            <span className="flex items-center gap-1"><span className="w-4 h-1.5 rounded-sm bg-green-500" />On time</span>
            <span className="flex items-center gap-1"><span className="w-4 h-1.5 rounded-sm bg-orange-500" />Late</span>
            <span className="flex items-center gap-1"><span className="w-4 h-1.5 rounded-sm bg-red-500" />Still in</span>
          </div>
        )}
        <div className="flex-1" />
        <div className="text-xs text-gray-400 hidden md:flex items-center gap-1">
          💡 Drag to create · Grab bar to move · Drag edges to resize · Double-click to edit details
        </div>
      </div>
            {/* ── Print View ── */}
      {showPrint && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto print:static">
          <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 className="text-lg font-bold">Print Roster</h2>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800">
                  🖨️ Print
                </button>
                <button onClick={() => setShowPrint(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>

            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">Staff Roster</h1>
              <p className="text-sm text-gray-500">{weekLabel}</p>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left py-2 px-2 border font-bold w-32">Staff</th>
                  {weekDates.map((date, i) => {
                    const dayDate = new Date(date + 'T00:00:00')
                    return (
                      <th key={date} className="text-center py-2 px-1 border font-bold">
                        <div>{DAY_LABELS[i]}</div>
                        <div className="text-xs font-normal text-gray-500">
                          {dayDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </div>
                      </th>
                    )
                  })}
                  <th className="text-center py-2 px-2 border font-bold w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, idx) => (
                  <tr key={s.id} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                    <td className="py-1.5 px-2 border font-medium text-xs">
                      {s.name}
                      <div className="text-[10px] text-gray-400 capitalize">{s.primary_department}</div>
                    </td>
                    {weekDates.map(date => {
                      const ents = getEntries(s.id, date)
                      const off = isRosteredOff(s.id, date)
                      return (
                        <td key={date} className="py-1.5 px-1 border text-center text-xs align-top">
                          {off ? (
                            <span className="text-gray-400 italic text-[10px]">Off</span>
                          ) : ents.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            ents.map((e, i) => (
                              <div key={e.id} className={i > 0 ? 'mt-0.5 pt-0.5 border-t border-dashed border-gray-200' : ''}>
                                <div className="font-medium">
                                  {e.scheduled_start && e.scheduled_end
                                    ? `${fmtTimeShort(e.scheduled_start)}–${fmtTimeShort(e.scheduled_end)}`
                                    : '—'}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {estimatedHours(e) > 0 ? `${estimatedHours(e).toFixed(1)}h` : ''}
                                  {e.department !== s.primary_department ? ` (${e.department})` : ''}
                                </div>
                                {e.manager_note && (
                                  <div className="text-[9px] text-gray-400 italic">{e.manager_note}</div>
                                )}
                              </div>
                            ))
                          )}
                        </td>
                      )
                    })}
                    <td className="py-1.5 px-2 border text-center font-bold text-xs">
                      {staffWeekHours(s.id) > 0 ? `${staffWeekHours(s.id).toFixed(1)}h` : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="py-2 px-2 border">Total</td>
                  {weekDates.map(date => {
                    const hrs = staff.reduce((sum, s) => sum + staffDayHours(s.id, date), 0)
                    return (
                      <td key={date} className="py-2 px-1 border text-center text-xs">
                        {hrs > 0 ? `${hrs.toFixed(1)}h` : '—'}
                      </td>
                    )
                  })}
                  <td className="py-2 px-2 border text-center">{totalWeeklyHours.toFixed(1)}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          <style jsx>{`
            @media print {
              .no-print { display: none !important; }
              body { font-size: 10px; }
              table { page-break-inside: avoid; }
            }
          `}</style>
        </div>
      )}


      {/* ── Edit Modal ── */}
      {editEntry && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditEntry(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b bg-gray-50 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{editEntry.entry ? 'Edit Shift' : 'Add Shift'}</h3>
                <p className="text-sm text-gray-500">
                  {staff.find(s => s.id === editEntry.staffId)?.name} · {new Date(editEntry.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {editEntry.entry && editEntry.entry.section > 1 && <span className="ml-1 text-amber-600 font-medium">(Split #{editEntry.entry.section})</span>}
                </p>
              </div>
              <button onClick={() => setEditEntry(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Department</label>
                <select value={editForm.department} onChange={e => setEditForm((p: any) => ({ ...p, department: e.target.value }))} className={inp}>
                  <option value="production">🍞 Production</option>
                  <option value="shop">🏪 Shop</option>
                  <option value="delivery">🚚 Delivery</option>
                  <option value="admin">📋 Admin</option>
                  <option value="management">👔 Management</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Start</label>
                  <input type="time" value={editForm.scheduled_start} onChange={e => setEditForm((p: any) => ({ ...p, scheduled_start: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Finish</label>
                  <input type="time" value={editForm.scheduled_end} onChange={e => setEditForm((p: any) => ({ ...p, scheduled_end: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Day Type</label>
                <select value={editForm.day_type} onChange={e => setEditForm((p: any) => ({ ...p, day_type: e.target.value }))} className={inp}>
                  <option value="normal">Normal</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                  <option value="public_holiday">Public Holiday</option>
                  <option value="leave">Leave</option>
                </select>
              </div>
              {editForm.day_type === 'public_holiday' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Holiday Name</label>
                  <input type="text" value={editForm.public_holiday_name} onChange={e => setEditForm((p: any) => ({ ...p, public_holiday_name: e.target.value }))} className={inp} placeholder="e.g. Easter Monday" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Note</label>
                <input type="text" value={editForm.manager_note} onChange={e => setEditForm((p: any) => ({ ...p, manager_note: e.target.value }))} className={inp} placeholder="Optional note…" />
              </div>
            </div>

            <div className="p-5 border-t bg-gray-50 rounded-b-2xl flex gap-2">
              <button onClick={handleSaveModal} disabled={saving}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors shadow-sm">
                {saving ? 'Saving…' : editEntry.entry ? 'Update Shift' : 'Add Shift'}
              </button>
              {editEntry.entry && (
                <button onClick={() => handleDelete(editEntry.entry!.id)} disabled={saving}
                  className="px-4 py-2.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              <button onClick={() => setEditEntry(null)} disabled={saving}
                className="px-4 py-2.5 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}