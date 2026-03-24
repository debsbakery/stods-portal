// app/admin/temperature/[weekStart]/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import {
  parseWeekStart, formatWeekStart,
  formatWeekLabel, prevWeek, nextWeek
} from '@/lib/week-utils'

/* ─── Equipment config ───────────────────────────────────────────────── */
interface Equipment {
  name: string
  minTemp: number
  maxTemp: number
  type: 'cold' | 'hot' | 'freezer'
}

const EQUIPMENT: Equipment[] = [
  { name: 'Cold Display',       minTemp: 0,   maxTemp: 5,   type: 'cold'    },
  { name: 'Drink Fridge 1',     minTemp: 0,   maxTemp: 5,   type: 'cold'    },
  { name: 'Drink Fridge 2',     minTemp: 0,   maxTemp: 5,   type: 'cold'    },
  { name: 'Bain Marie',         minTemp: 60,  maxTemp: 85,  type: 'hot'     },
  { name: 'Pie Warmer',         minTemp: 60,  maxTemp: 85,  type: 'hot'     },
  { name: 'Cold Room 1',        minTemp: 0,   maxTemp: 5,   type: 'cold'    },
  { name: 'Small Freezer 1',    minTemp: -25, maxTemp: -12, type: 'freezer' },
  { name: 'Small Freezer 2',    minTemp: -25, maxTemp: -12, type: 'freezer' },
  { name: 'Small Fridge',       minTemp: 0,   maxTemp: 5,   type: 'cold'    },
  { name: 'Large Freezer',      minTemp: -25, maxTemp: -12, type: 'freezer' },
  { name: 'Upstairs Cold Room', minTemp: 0,   maxTemp: 5,   type: 'cold'    },
]

/* ── Mon–Fri: weekStart is Sunday so +1 to +5 ── */
function getWeekDaysMF(weekStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i + 1))
}

function isOutOfRange(temp: number | null, eq: Equipment): boolean {
  if (temp === null) return false
  return temp < eq.minTemp || temp > eq.maxTemp
}

function equipmentBadge(type: Equipment['type']) {
  if (type === 'cold')    return 'bg-blue-100 text-blue-700'
  if (type === 'hot')     return 'bg-orange-100 text-orange-700'
  if (type === 'freezer') return 'bg-indigo-100 text-indigo-700'
  return ''
}

function equipmentIcon(type: Equipment['type']) {
  if (type === 'cold')    return '❄️'
  if (type === 'hot')     return '🔥'
  if (type === 'freezer') return '🧊'
  return '🌡️'
}

type LogKey = string

interface LogRow {
  week_start:     string
  equipment_name: string
  log_date:       string
  temperature:    number | null
  checked_by:     string
  notes:          string
}

function logKey(name: string, date: string) {
  return `${name}__${date}`
}

export default function TemperatureLog() {
  const { weekStart: param } = useParams<{ weekStart: string }>()
  const router = useRouter()

  const weekStart  = parseWeekStart(param)
  const weekDays   = getWeekDaysMF(weekStart)
  const weekLabel  = formatWeekLabel(weekStart)
  const dayHeaders = weekDays.map(d => format(d, 'EEE d/M'))
  const dateStrs   = weekDays.map(d => format(d, 'yyyy-MM-dd'))

  const [logs,      setLogs]      = useState<Record<LogKey, LogRow>>({})
  const [checkedBy, setCheckedBy] = useState<Record<string, string>>({})
  const [saving,    setSaving]    = useState(false)
  const [isDirty,   setIsDirty]   = useState(false)
  const [loaded,    setLoaded]    = useState(false)
  const [printDate, setPrintDate] = useState('')
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  /* ── Fix hydration — only set print date client-side ── */
  useEffect(() => {
    setPrintDate(format(new Date(), 'dd/MM/yyyy HH:mm'))
  }, [])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── Load ── */
  const loadData = useCallback(async () => {
    setLoaded(false)
    const res = await fetch(`/api/admin/temperature/${param}`)
    const { logs: data } = await res.json()

    const logMap: Record<LogKey, LogRow> = {}
    const cbMap:  Record<string, string> = {}

    dateStrs.forEach(date => { cbMap[date] = '' })

    EQUIPMENT.forEach(eq => {
      dateStrs.forEach(date => {
        const key      = logKey(eq.name, date)
        const existing = (data ?? []).find(
          (r: LogRow) => r.equipment_name === eq.name && r.log_date === date
        )
        logMap[key] = existing ?? {
          week_start:     param,
          equipment_name: eq.name,
          log_date:       date,
          temperature:    null,
          checked_by:     '',
          notes:          '',
        }
        if (existing?.checked_by) cbMap[date] = existing.checked_by
      })
    })

    setLogs(logMap)
    setCheckedBy(cbMap)
    setIsDirty(false)
    setLoaded(true)
  }, [param])

  useEffect(() => { loadData() }, [loadData])

  /* ── Auto-save ── */
  function triggerAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => handleSave(), 1500)
  }

  /* ── Update temperature ── */
  function updateTemp(name: string, date: string, val: string) {
    const key  = logKey(name, date)
    const temp = val === '' ? null : parseFloat(val)
    setLogs(prev => ({
      ...prev,
      [key]: { ...prev[key], temperature: temp }
    }))
    setIsDirty(true)
    triggerAutoSave()
  }

  /* ── Update checked_by — applies to all equipment on that day ── */
  function updateCheckedBy(date: string, val: string) {
    setCheckedBy(prev => ({ ...prev, [date]: val }))
    setLogs(prev => {
      const updated = { ...prev }
      EQUIPMENT.forEach(eq => {
        const key = logKey(eq.name, date)
        if (updated[key]) {
          updated[key] = { ...updated[key], checked_by: val }
        }
      })
      return updated
    })
    setIsDirty(true)
    triggerAutoSave()
  }

  /* ── Update daily notes ── */
  function updateDayNotes(date: string, val: string) {
    setLogs(prev => {
      const updated = { ...prev }
      EQUIPMENT.forEach(eq => {
        const key = logKey(eq.name, date)
        if (updated[key]) {
          updated[key] = { ...updated[key], notes: val }
        }
      })
      return updated
    })
    setIsDirty(true)
    triggerAutoSave()
  }

  /* ── Save ── */
  async function handleSave() {
    setSaving(true)
    const rows = Object.values(logs)
    const res  = await fetch(`/api/admin/temperature/${param}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows }),
    })
    setSaving(false)
    if (res.ok) { showToast('✅ Saved'); setIsDirty(false) }
    else showToast('❌ Save failed', false)
  }

  /* ── Alert count ── */
  const alertCount = !loaded ? 0 : Object.values(logs).filter(r => {
    const eq = EQUIPMENT.find(e => e.name === r.equipment_name)
    return eq !== undefined && r.temperature !== null && isOutOfRange(r.temperature, eq)
  }).length

  const hasAnyTemp = loaded && Object.values(logs).some(r => r.temperature !== null)

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 md:p-6 max-w-full">

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 10px; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white text-sm
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6 no-print">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/admin/shop-reports/' + param)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            ← Shop Reports
          </button>
          <h1 className="text-2xl font-bold text-gray-900">🌡️ Temperature Log</h1>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => router.push(`/admin/temperature/${formatWeekStart(prevWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">◀ Prev</button>
          <span className="font-semibold text-gray-700 px-1">{weekLabel}</span>
          <button
            onClick={() => router.push(`/admin/temperature/${formatWeekStart(nextWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">Next ▶</button>
        </div>

        <div className="flex gap-2 ml-auto items-center">
          {loaded && alertCount > 0 && (
            <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-sm font-medium">
              ⚠️ {alertCount} alert{alertCount > 1 ? 's' : ''}
            </span>
          )}
          {loaded && alertCount === 0 && hasAnyTemp && (
            <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-sm font-medium">
              ✅ All in range
            </span>
          )}
          <button onClick={() => window.print()}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600 no-print">
            🖨️ Print
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
              ${saving  ? 'bg-blue-400 text-white cursor-wait'
              : isDirty ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-green-600 text-white'}`}>
            {saving ? '💾 Saving...' : isDirty ? '💾 Save *' : '✅ Saved'}
          </button>
        </div>
      </div>

      {/* Print header — no new Date() in render, uses state */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">🌡️ Temperature Control Log — {weekLabel}</h2>
        <p className="text-sm text-gray-500">Stods Bakery — Food Safety Records</p>
        {printDate && (
          <p className="text-xs text-gray-400 mt-1">Printed: {printDate}</p>
        )}
      </div>

      {/* Loading */}
      {!loaded ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🌡️</div>
          <p>Loading temperature log...</p>
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-xs no-print">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-200 inline-block"/>
              In range
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-200 inline-block"/>
              Out of range ⚠️
            </span>
            <span className="flex items-center gap-1.5">❄️ Cold (0–5°C)</span>
            <span className="flex items-center gap-1.5">🔥 Hot (60–85°C)</span>
            <span className="flex items-center gap-1.5">🧊 Freezer (−25 to −12°C)</span>
          </div>

          {/* Main table */}
          <div className="bg-white rounded-xl shadow border overflow-x-auto">
            <table className="w-full text-sm min-w-[750px]">
              <thead>
                <tr className="bg-gray-800 text-white text-xs">
                  <th className="text-left px-3 py-2.5 w-44">Equipment</th>
                  <th className="text-left px-2 py-2.5 w-20">Type</th>
                  <th className="text-left px-2 py-2.5 w-28">Safe Range</th>
                  {dayHeaders.map(h => (
                    <th key={h} className="text-center px-1 py-2.5 w-[100px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EQUIPMENT.map((eq, idx) => (
                  <tr key={eq.name}
                    className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>

                    <td className="px-3 py-1.5 font-medium text-gray-700 text-xs">
                      {equipmentIcon(eq.type)} {eq.name}
                    </td>

                    <td className="px-2 py-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                        ${equipmentBadge(eq.type)}`}>
                        {eq.type}
                      </span>
                    </td>

                    <td className="px-2 py-1.5 text-xs text-gray-400">
                      {eq.minTemp}° to {eq.maxTemp}°C
                    </td>

                    {dateStrs.map(date => {
                      const row  = logs[logKey(eq.name, date)]
                      const temp = row?.temperature ?? null
                      const oor  = isOutOfRange(temp, eq)
                      return (
                        <td key={date}
                          className={`px-1 py-1
                            ${oor ? 'bg-red-50' : temp !== null ? 'bg-green-50' : ''}`}>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              value={temp === null ? '' : temp}
                              onChange={e => updateTemp(eq.name, date, e.target.value)}
                              placeholder="—"
                              className={`w-full border rounded px-1.5 py-1 text-right text-sm
                                focus:outline-none focus:ring-1
                                ${oor
                                  ? 'border-red-300 focus:ring-red-400 bg-red-50 text-red-700 font-bold'
                                  : temp !== null
                                    ? 'border-green-300 focus:ring-green-400 bg-green-50 text-green-700'
                                    : 'focus:ring-blue-400 bg-white'
                                }`}
                            />
                            {oor && (
                              <span className="absolute -top-1.5 -right-1 text-xs">⚠️</span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Checked by row */}
                <tr className="border-t-2 border-gray-300 bg-gray-100">
                  <td colSpan={3} className="px-3 py-2 font-semibold text-gray-600 text-xs">
                    ✍️ Checked by
                  </td>
                  {dateStrs.map(date => (
                    <td key={date} className="px-1 py-1">
                      <input
                        type="text"
                        value={checkedBy[date] ?? ''}
                        onChange={e => updateCheckedBy(date, e.target.value)}
                        placeholder="Name"
                        className="w-full border rounded px-1.5 py-1 text-sm text-center
                          focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    </td>
                  ))}
                </tr>

              </tbody>
            </table>
          </div>

          {/* Notes section */}
          <div className="mt-6 bg-white rounded-xl shadow border p-4">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">
              📝 Daily Notes / Corrective Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {dateStrs.map((date, i) => {
                const oorItems = EQUIPMENT.filter(eq => {
                  const row = logs[logKey(eq.name, date)]
                  return row !== undefined
                    && row.temperature !== null
                    && isOutOfRange(row.temperature, eq)
                })
                const dayNote = EQUIPMENT.reduce((found, eq) => {
                  if (found) return found
                  return logs[logKey(eq.name, date)]?.notes ?? ''
                }, '')

                return (
                  <div key={date}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">
                      {dayHeaders[i]}
                    </label>
                    {oorItems.map(eq => (
                      <div key={eq.name} className="text-xs text-red-600 mb-1">
                        ⚠️ {eq.name}: {logs[logKey(eq.name, date)]?.temperature}°C
                      </div>
                    ))}
                    <textarea
                      rows={3}
                      placeholder="Notes / corrective action..."
                      className="w-full border rounded px-2 py-1 text-xs
                        focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                      value={dayNote}
                      onChange={e => updateDayNotes(date, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Out of range summary */}
          {alertCount > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <h2 className="font-semibold text-red-800 mb-2 text-sm">
                ⚠️ Out of Range This Week
              </h2>
              <div className="space-y-1">
                {Object.values(logs)
                  .filter(r => {
                    const eq = EQUIPMENT.find(e => e.name === r.equipment_name)
                    return eq !== undefined
                      && r.temperature !== null
                      && isOutOfRange(r.temperature, eq)
                  })
                  .map(r => (
                    <div key={`${r.equipment_name}${r.log_date}`}
                      className="text-sm text-red-700 flex gap-3 flex-wrap">
                      <span className="font-medium">{r.equipment_name}</span>
                      <span>{format(new Date(r.log_date + 'T00:00:00'), 'EEE d/M')}</span>
                      <span className="font-bold">{r.temperature}°C</span>
                      {r.checked_by && (
                        <span className="text-red-500">— {r.checked_by}</span>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}