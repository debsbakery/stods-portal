'use client'

import { useState, useMemo } from 'react'
import { Printer, Eye } from 'lucide-react'

// ── Date helpers ─────────────────────────────────────────────────────────────

function toISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toISO(d)
}

function todayISO(): string {
  return toISO(new Date())
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

function formatLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getDatesInRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return []
  const dates: string[] = []
  let current = start
  while (current <= end) {
    dates.push(current)
    current = addDays(current, 1)
  }
  return dates
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProductionSheetLauncher({ inline = false }: { inline?: boolean }) {
  const [open, setOpen]           = useState(inline)
  const [startDate, setStartDate] = useState<string>(tomorrowISO())
  const [endDate, setEndDate]     = useState<string>(tomorrowISO())

  // ── Preset setters ──────────────────────────────────────────────────────
  const setToday = () => {
    const t = todayISO()
    setStartDate(t)
    setEndDate(t)
  }

  const setTomorrow = () => {
    const t = tomorrowISO()
    setStartDate(t)
    setEndDate(t)
  }

  const setTodayAndTomorrow = () => {
    setStartDate(todayISO())
    setEndDate(tomorrowISO())
  }

  const setNextWeek = () => {
    const start = todayISO()
    setStartDate(start)
    setEndDate(addDays(start, 6))
  }

  // ── Derived values ──────────────────────────────────────────────────────
  const selectedDates = useMemo(
    () => getDatesInRange(startDate, endDate),
    [startDate, endDate]
  )

  const dayCount = selectedDates.length

  const rangeLabel = useMemo(() => {
    if (dayCount === 0) return ''
    if (dayCount === 1) return formatLabel(selectedDates[0])
    return `${formatLabel(selectedDates[0])} — ${formatLabel(selectedDates[dayCount - 1])}`
  }, [selectedDates, dayCount])

  // ── Actions ─────────────────────────────────────────────────────────────
    // ── Actions ─────────────────────────────────────────────────────────────
  const buildUrl = (mode: 'view' | 'print') => {
    const dates = selectedDates.join(',')
    const params = new URLSearchParams({ dates })
    if (mode === 'print') params.set('autoprint', '1')
    return `/admin/production/print?${params.toString()}`
  }

  const handleView = () => {
    if (dayCount === 0) return
    window.open(buildUrl('view'), '_blank')
  }

  const handlePrint = () => {
    if (dayCount === 0) return
    window.open(buildUrl('print'), '_blank')
  }
  // ── Panel (shared between inline + dropdown) ────────────────────────────
  const panel = (
    <div
      className={
        inline
          ? 'bg-white rounded-xl shadow-md p-6 space-y-4'
          : 'absolute right-0 top-12 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 space-y-4'
      }
    >
      <p className="text-sm font-semibold text-gray-700">Select date range:</p>

      {/* ── Presets ── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Today',           fn: setToday           },
          { label: 'Tomorrow',        fn: setTomorrow        },
          { label: 'Today+Tomorrow',  fn: setTodayAndTomorrow },
          { label: 'Next 7 Days',     fn: setNextWeek        },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border font-medium transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Date inputs ── */}
      <div className={inline ? 'grid grid-cols-2 gap-4' : 'space-y-3'}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => {
              setStartDate(e.target.value)
              if (e.target.value > endDate) setEndDate(e.target.value)
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
      </div>

      {/* ── Preview chips ── */}
      {dayCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-green-800 mb-1">
            {dayCount} day{dayCount > 1 ? 's' : ''} selected:
          </p>
          <div className="flex flex-wrap gap-1">
            {selectedDates.map(d => (
              <span
                key={d}
                className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full"
              >
                {formatLabel(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Warning for large ranges ── */}
      {dayCount > 7 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
          Warning: {dayCount} days selected — may be slow to load.
        </p>
      )}

      {/* ── View / Print buttons ── */}
      <div className="flex gap-3">
        <button
          onClick={handleView}
          disabled={dayCount === 0}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm border-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{ borderColor: '#006A4E', color: '#006A4E' }}
        >
          <Eye className="h-4 w-4" />
          View Sheet
        </button>
        <button
          onClick={handlePrint}
          disabled={dayCount === 0}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: '#CE1126' }}
        >
          <Printer className="h-4 w-4" />
          Print Sheet
        </button>
      </div>

      {/* ── Range summary label ── */}
      {dayCount > 0 && (
        <p className="text-xs text-center text-gray-400">{rangeLabel}</p>
      )}
    </div>
  )

  // ── Inline mode — just render the panel directly ────────────────────────
  if (inline) {
    return <div>{panel}</div>
  }

  // ── Dropdown mode ───────────────────────────────────────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#006A4E' }}
      >
        <Printer className="h-4 w-4" />
        Production Sheet
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {panel}
        </>
      )}
    </div>
  )
}