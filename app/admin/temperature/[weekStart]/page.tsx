'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  parseWeekStart, getWeekDays, formatWeekStart,
  formatWeekLabel, prevWeek, nextWeek
} from '@/lib/week-utils'

interface TempRow {
  shop_id: string
  log_date: string
    drink_fridge_1: number | null
  drink_fridge_2: number | null
  shop_fridge: number | null
  milk_fridge: number | null
  display_fridge: number | null
  pie_warmer: number | null
  coldroom: number | null
  big_freezer: number | null
  action_taken: string              // ← ADDED
}

interface CashReconRow {
  shop_id: string
  recon_date: string
  cash_in: number
  carried_forward: number
}

interface PaidOutRow {
  shop_id: string
  paid_date: string
  amount: number
  reason: string
  sort_order: number
}

const TEMP_FIELDS = [
  { key: 'drink_fridge_1', label: 'Drink Fridge 1', target: 4, warn: 5 },
  { key: 'drink_fridge_2', label: 'Drink Fridge 2', target: 4, warn: 5 },
  { key: 'shop_fridge',    label: 'Shop Fridge',    target: 4, warn: 5 },
  { key: 'milk_fridge',    label: 'Milk Fridge',    target: 4, warn: 5 },
  { key: 'display_fridge', label: 'Display Fridge', target: 4, warn: 5 },
  { key: 'pie_warmer',     label: 'Pie Warmer',     target: 65, warn: 60 },
  { key: 'coldroom',       label: 'Coldroom',       target: 4, warn: 5 },
  { key: 'big_freezer',    label: 'Big Freezer',    target: -18, warn: -15 },
] as const

function fmtMoney(n: number) { return `$${n.toFixed(2)}` }

export default function TemperatureCashPage() {
  const { weekStart: param } = useParams<{ weekStart: string }>()
  const router = useRouter()

  const weekStart = parseWeekStart(param)
  const weekDays = getWeekDays(weekStart)
  const weekLabel = formatWeekLabel(weekStart)
  const dayHeaders = weekDays.map(d => format(d, 'EEE d/M'))
  const dayDates = weekDays.map(d => format(d, 'yyyy-MM-dd'))

  const [temps, setTemps] = useState<Record<string, TempRow>>({})
  const [cashRecon, setCashRecon] = useState<Record<string, CashReconRow>>({})
  const [paidOuts, setPaidOuts] = useState<Record<string, PaidOutRow[]>>({})
  const [prevCarriedForward, setPrevCarriedForward] = useState(0)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/admin/temperature/${param}`)
    const data = await res.json()

    const tempMap: Record<string, TempRow> = {}
    dayDates.forEach(date => {
      const key = `markets_${date}`
      const found = data.temps?.find((t: TempRow) => t.shop_id === 'markets' && t.log_date === date)
      tempMap[key] = found ?? {
        shop_id: 'markets',
        log_date: date,
                drink_fridge_1: null,
        drink_fridge_2: null,
        shop_fridge: null,
        milk_fridge: null,
        display_fridge: null,
        pie_warmer: null,
        coldroom: null,
        big_freezer: null,
        action_taken: '',               // ← ADDED
      }
    })
    setTemps(tempMap)

    const reconMap: Record<string, CashReconRow> = {}
    dayDates.forEach(date => {
      const key = `markets_${date}`
      const found = data.cashRecon?.find((c: CashReconRow) => c.shop_id === 'markets' && c.recon_date === date)
      reconMap[key] = found ?? {
        shop_id: 'markets',
        recon_date: date,
        cash_in: 0,
        carried_forward: 0,
      }
    })
    setCashRecon(reconMap)

    const paidMap: Record<string, PaidOutRow[]> = {}
    dayDates.forEach(date => {
      paidMap[date] = data.paidOuts?.filter((p: PaidOutRow) => p.paid_date === date) ?? []
    })
    setPaidOuts(paidMap)

    setPrevCarriedForward(data.previousCarriedForward ?? 0)
    setIsDirty(false)
  }, [param])

  useEffect(() => { loadData() }, [loadData])
// Add this useEffect in temperature page after the existing useEffects:
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (isDirty) { e.preventDefault(); e.returnValue = '' }
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [isDirty])
  function triggerAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { handleSave() }, 2000)
  }

  // ← UPDATED — handles both text and number fields
  function updateTemp(date: string, field: string, val: string) {
    const key = `markets_${date}`
    setTemps(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === 'action_taken' ? val : (val === '' ? null : parseFloat(val))
      }
    }))
    setIsDirty(true)
    triggerAutoSave()
  }

  function updateCashIn(date: string, val: string) {
    const key = `markets_${date}`
    setCashRecon(prev => ({
      ...prev,
      [key]: { ...prev[key], cash_in: parseFloat(val) || 0 }
    }))
    setIsDirty(true)
    triggerAutoSave()
  }

  function addPaidOut(date: string) {
    setPaidOuts(prev => ({
      ...prev,
      [date]: [...(prev[date] ?? []), {
        shop_id: 'markets',
        paid_date: date,
        amount: 0,
        reason: '',
        sort_order: (prev[date]?.length ?? 0),
      }]
    }))
    setIsDirty(true)
  }

  function updatePaidOut(date: string, idx: number, field: 'amount' | 'reason', val: string) {
    setPaidOuts(prev => {
      const list = [...(prev[date] ?? [])]
      list[idx] = {
        ...list[idx],
        [field]: field === 'amount' ? (parseFloat(val) || 0) : val
      }
      return { ...prev, [date]: list }
    })
    setIsDirty(true)
    triggerAutoSave()
  }

  function removePaidOut(date: string, idx: number) {
    setPaidOuts(prev => {
      const list = (prev[date] ?? []).filter((_, i) => i !== idx)
      return { ...prev, [date]: list }
    })
    setIsDirty(true)
    triggerAutoSave()
  }

  function getCarriedForward(dayIndex: number): number {
    let cf = prevCarriedForward
    for (let i = 0; i <= dayIndex; i++) {
      const date = dayDates[i]
      const key = `markets_${date}`
      const cashIn = cashRecon[key]?.cash_in ?? 0
      const totalPaidOut = (paidOuts[date] ?? []).reduce((a, p) => a + p.amount, 0)
      if (i < dayIndex) {
        cf = cf + cashIn - totalPaidOut
      } else {
        return cf + cashIn - totalPaidOut
      }
    }
    return cf
  }

  async function handleSave() {
    setSaving(true)

    const tempRows = Object.values(temps)
    const reconRows = dayDates.map((date, i) => ({
      shop_id: 'markets',
      recon_date: date,
      cash_in: cashRecon[`markets_${date}`]?.cash_in ?? 0,
      carried_forward: getCarriedForward(i),
    }))
    const allPaidOuts = dayDates.flatMap(date =>
      (paidOuts[date] ?? []).map((p, idx) => ({
        shop_id: 'markets',
        paid_date: date,
        amount: p.amount,
        reason: p.reason,
        sort_order: idx,
      }))
    )

    const res = await fetch(`/api/admin/temperature/${param}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temps: tempRows,
        cashRecon: reconRows,
        paidOuts: allPaidOuts,
      })
    })

    setSaving(false)
    if (res.ok) { showToast('✅ Saved'); setIsDirty(false) }
    else showToast('❌ Save failed', false)
  }

  return (
    <div className="p-4 md:p-6 max-w-full">

      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white text-sm
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🌡️ Temp Log &amp; 💵 Cash Recon</h1>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => router.push(`/admin/temperature/${formatWeekStart(prevWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">◀ Prev</button>
          <span className="font-semibold text-gray-700 px-1">{weekLabel}</span>
          <button
            onClick={() => router.push(`/admin/temperature/${formatWeekStart(nextWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">Next ▶</button>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => router.push(`/admin/shop-reports/${param}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            📊 Shop Reports
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
              ${saving ? 'bg-blue-400 text-white cursor-wait'
                : isDirty ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-green-600 text-white'}`}>
            {saving ? '💾 Saving...' : isDirty ? '💾 Save *' : '✅ Saved'}
          </button>
        </div>
      </div>

      <div className="space-y-6">

        {/* ═══ TEMPERATURE LOG — Markets ═══ */}
        <div className="bg-white rounded-xl shadow border overflow-x-auto">
          <div className="bg-indigo-700 text-white px-4 py-2.5 font-semibold rounded-t-xl">
            🌡️ Temperature Log 
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600 text-xs">
                <th className="text-left px-3 py-2 w-32">Reading</th>
                {dayHeaders.map(h => (
                  <th key={h} className="text-center px-1 py-2 w-[90px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEMP_FIELDS.map(({ key, label, target, warn }) => (
                <tr key={key} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-600 text-xs">
                    {label}
                    <br />
                    <span className="text-gray-400 text-[10px]">Target: {target}°C</span>
                  </td>
                  {dayDates.map(date => {
                    const val = temps[`markets_${date}`]?.[key]
                    const numVal = val !== null && val !== undefined ? Number(val) : null
                    const isWarn = numVal !== null && (
                      key === 'pie_warmer' ? numVal < warn : numVal > warn
                    )
                    return (
                      <td key={date} className="px-1 py-1">
                        <input
                          type="number"
                          step="0.1"
                          value={val === null || val === undefined ? '' : val}
                          onChange={e => updateTemp(date, key, e.target.value)}
                          placeholder="—"
                          className={`w-full border rounded px-1.5 py-1 text-right text-sm
                            focus:outline-none focus:ring-1 focus:ring-indigo-400
                            ${isWarn ? 'border-red-300 bg-red-50 text-red-700' : ''}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}

              {/* ═══ ACTION TAKEN ROW ═══ */}
              <tr className="border-b hover:bg-gray-50 bg-orange-50">
                <td className="px-3 py-1.5 font-medium text-orange-700 text-xs">
                  Action Taken
                  <br />
                  <span className="text-orange-400 text-[10px]">If out of range</span>
                </td>
                {dayDates.map(date => {
                  const val = temps[`markets_${date}`]?.action_taken ?? ''
                  return (
                    <td key={date} className="px-1 py-1">
                      <textarea
                        value={val}
                        onChange={e => updateTemp(date, 'action_taken', e.target.value)}
                        placeholder="—"
                        rows={2}
                        className="w-full border rounded px-1.5 py-1 text-left text-xs
                          focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
                      />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t">
            ⚠️ Fridges/Coldroom: red above 5°C · Big Freezer: red above -15°C · Pie Warmer: red below 60°C
          </div>
        </div>

        {/* ═══ CASH RECONCILIATION — Markets ═══ */}
        <div className="bg-white rounded-xl shadow border overflow-x-auto">
          <div className="bg-emerald-700 text-white px-4 py-2.5 font-semibold rounded-t-xl flex items-center justify-between">
            <span>💵 Cash Reconciliation </span>
            <span className="text-emerald-200 text-sm font-normal">
              Previous C/F: {fmtMoney(prevCarriedForward)}
            </span>
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600 text-xs">
                <th className="text-left px-3 py-2 w-32">Item</th>
                {dayHeaders.map(h => (
                  <th key={h} className="text-center px-1 py-2 w-[130px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Cash In */}
              <tr className="border-b hover:bg-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-600 text-xs">Cash In</td>
                {dayDates.map(date => {
                  const val = cashRecon[`markets_${date}`]?.cash_in ?? 0
                  return (
                    <td key={date} className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={val === 0 ? '' : val}
onChange={e => updateCashIn(date, e.target.value)}
onBlur={handleSave}
                          placeholder="0.00"
                          className="w-full border rounded px-1.5 py-1 text-right text-sm
                            focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        />
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Paid Out Lines */}
              <tr className="border-b bg-amber-50">
                <td className="px-3 py-1.5 font-semibold text-amber-800 text-xs">Paid Out</td>
                {dayDates.map(date => {
                  const items = paidOuts[date] ?? []
                  const total = items.reduce((a, p) => a + p.amount, 0)
                  return (
                    <td key={date} className="px-1 py-1 align-top">
                      <div className="space-y-1">
                        {items.map((item, idx) => (
                          <div key={idx} className="flex gap-1 items-start">
                            <div className="flex-1 space-y-0.5">
                              <input
                                type="number" min="0" step="0.01"
                                value={item.amount === 0 ? '' : item.amount}
onChange={e => updatePaidOut(date, idx, 'amount', e.target.value)}
onBlur={handleSave}

                                placeholder="$0.00"
                                className="w-full border rounded px-1 py-0.5 text-right text-xs
                                  focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                              <input
                                type="text"
                                value={item.reason}
onChange={e => updatePaidOut(date, idx, 'reason', e.target.value)}
onBlur={handleSave}
                                placeholder="Reason..."
                                className="w-full border rounded px-1 py-0.5 text-xs text-gray-600
                                  focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            </div>
                            <button
                              onClick={() => removePaidOut(date, idx)}
                              className="text-red-400 hover:text-red-600 text-sm leading-none mt-1"
                            >×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => addPaidOut(date)}
                          className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                        >
                          + Add
                        </button>
                        {total > 0 && (
                          <div className="text-xs font-bold text-amber-800 text-right border-t pt-0.5">
                            {fmtMoney(total)}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Carried Forward */}
              <tr className="border-b bg-emerald-50">
                <td className="px-3 py-2 font-bold text-emerald-800 text-xs">Carried Forward</td>
                {dayDates.map((date, i) => {
                  const cf = getCarriedForward(i)
                  return (
                    <td key={date} className="px-2 py-2 text-right">
                      <span className={`font-bold text-sm ${
                        cf < 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}>
                        {fmtMoney(cf)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t">
            💡 Carried Forward = Previous C/F + Cash In − Paid Out. Auto-calculates across the week.
          </div>
        </div>

      </div>
    </div>
  )
}