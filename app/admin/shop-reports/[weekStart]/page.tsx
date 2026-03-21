// app/admin/shop-reports/[weekStart]/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  parseWeekStart, getWeekDays, formatWeekStart,
  formatWeekLabel, prevWeek, nextWeek
} from '@/lib/week-utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Shop { id: string; name: string; sort_order: number }

interface DailyRow {
  shop_id: string
  report_date: string
  sales: number
  gst: number
  eftpos: number
  cash: number
  paid_out: number
    purchases: number     
  customer_count: number
  hours: number
}

interface WageRow {
  shop_id: string
  week_start: string
  wages: number
}

interface Settings {
  id: string
  bookkeeper_email: string
  bookkeeper_name: string
}

type DailyKey = keyof Omit<DailyRow, 'shop_id' | 'report_date'>

// ─── Update FIELDS array — add purchases after paid_out ───────────────────────
const FIELDS: { key: DailyKey; label: string; isMoney: boolean }[] = [
  { key: 'sales',          label: 'Sales',      isMoney: true  },
  { key: 'gst',            label: 'GST',        isMoney: true  },
  { key: 'eftpos',         label: 'Eftpos',     isMoney: true  },
  { key: 'cash',           label: 'Cash',       isMoney: true  },
  { key: 'paid_out',       label: 'Paid Out',   isMoney: true  },
  { key: 'purchases',      label: 'Purchases',  isMoney: true  },  // ← ADD
  { key: 'customer_count', label: 'Customers',  isMoney: false },
  { key: 'hours',          label: 'Hours',      isMoney: false },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Update emptyDaily helper ─────────────────────────────────────────────────
function emptyDaily(shopId: string, date: string): DailyRow {
  return {
    shop_id: shopId, report_date: date,
    sales: 0, gst: 0, eftpos: 0, cash: 0,
    paid_out: 0, purchases: 0,             // ← ADD purchases: 0
    customer_count: 0, hours: 0
  }
}
function colSum(rows: DailyRow[], key: DailyKey): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function netSales(row: DailyRow)  { return row.sales - row.gst }
// ✅ FIX — paid out is informational, not part of variance
function variance(row: DailyRow) { return row.sales - row.eftpos - row.cash }function fmtMoney(n: number)      { return `$${n.toFixed(2)}` }
function fmtNum(n: number, dec=2) { return n === 0 ? '—' : n.toFixed(dec) }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WeeklyShopReport() {
  const { weekStart: param } = useParams<{ weekStart: string }>()
  const router   = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  const weekStart = parseWeekStart(param)
  const weekDays  = getWeekDays(weekStart)
  const weekLabel = formatWeekLabel(weekStart)
  const dayHeaders = weekDays.map(d => format(d, 'EEE d/M'))

  const [shops,    setShops]    = useState<Shop[]>([])
  const [daily,    setDaily]    = useState<Record<string, DailyRow>>({})
  const [wages,    setWages]    = useState<Record<string, number>>({})
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Load ──────────────────────────────────────────────────────────────────
 const loadData = useCallback(async () => {
    const res = await fetch(`/api/admin/shop-reports/${param}`)
    const { shops: s, daily: d, wages: w, settings: st } = await res.json()

    console.log('SHOP REPORTS DEBUG:', { shops: s, daily: d, wages: w, settings: st }) // ← ADD THIS

    setShops(s ?? [])
    setSettings(st ?? null)
    // ... rest unchanged

    const dailyMap: Record<string, DailyRow> = {}
    s?.forEach((shop: Shop) => {
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const key     = `${shop.id}_${dateStr}`
        const found   = d?.find((r: DailyRow) =>
          r.shop_id === shop.id && r.report_date === dateStr)
        dailyMap[key] = found ?? emptyDaily(shop.id, dateStr)
      })
    })
    setDaily(dailyMap)

    const wagesMap: Record<string, number> = {}
    s?.forEach((shop: Shop) => {
      const found = w?.find((r: WageRow) => r.shop_id === shop.id)
      wagesMap[shop.id] = found?.wages ?? 0
    })
    setWages(wagesMap)
  }, [param])

  useEffect(() => { loadData() }, [loadData])

  // ─── Cell updates ──────────────────────────────────────────────────────────
  function updateCell(shopId: string, date: string, field: DailyKey, val: string) {
    const key   = `${shopId}_${date}`
    const value = parseFloat(val) || 0
    setDaily(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  function updateWage(shopId: string, val: string) {
    setWages(prev => ({ ...prev, [shopId]: parseFloat(val) || 0 }))
  }

  // ─── Save week ─────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const dailyRows = Object.values(daily)
    const wageRows  = shops.map(s => ({
      shop_id:    s.id,
      week_start: param,
      wages:      wages[s.id] ?? 0
    }))

    const res = await fetch(`/api/admin/shop-reports/${param}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ dailyRows, wageRows })
    })
    setSaving(false)
    res.ok ? showToast('✅ Week saved') : showToast('❌ Save failed', false)
  }

  // ─── Save settings ─────────────────────────────────────────────────────────
  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return
    setSavingSettings(true)
    const res = await fetch('/api/admin/shop-reports/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(settings)
    })
    setSavingSettings(false)
    if (res.ok) { showToast('✅ Settings saved'); setShowSettings(false) }
    else showToast('❌ Failed to save settings', false)
  }

  // ─── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() { window.print() }

  // ─── Combined totals ───────────────────────────────────────────────────────
  function getCombined() {
    let totalSales = 0, totalGst = 0, totalEftpos = 0, totalCash = 0,
        totalPaidOut = 0, totalCustomers = 0, totalHours = 0, totalWages = 0

    shops.forEach(shop => {
      const rows = weekDays.map(d =>
        daily[`${shop.id}_${format(d, 'yyyy-MM-dd')}`] ?? emptyDaily(shop.id, '')
      )
      totalSales     += colSum(rows, 'sales')
      totalGst       += colSum(rows, 'gst')
      totalEftpos    += colSum(rows, 'eftpos')
      totalCash      += colSum(rows, 'cash')
      totalPaidOut   += colSum(rows, 'paid_out')
      totalCustomers += colSum(rows, 'customer_count')
      totalHours     += colSum(rows, 'hours')
      totalWages     += wages[shop.id] ?? 0
    })

    const totalNetSales = totalSales - totalGst
const totalVariance = totalSales - totalEftpos - totalCash
    const wagesPct      = totalNetSales > 0
      ? ((totalWages / totalNetSales) * 100).toFixed(1)
      : '0.0'

    return { totalSales, totalGst, totalNetSales, totalEftpos, totalCash,
             totalPaidOut, totalVariance, totalCustomers, totalHours,
             totalWages, wagesPct }
  }

  const combined = getCombined()

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-full">

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11px; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 no-print">
        <h1 className="text-2xl font-bold text-gray-900">Shop Reports</h1>

        {/* Week nav */}
        <div className="flex items-center gap-2 ml-4">
          <button onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(prevWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">
            ◀ Prev
          </button>
          <span className="font-semibold text-gray-700 px-1">{weekLabel}</span>
          <button onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(nextWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">
            Next ▶
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            ⚙️ Settings
          </button>
          <button onClick={handlePrint}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            🖨️ Print
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : '💾 Save Week'}
          </button>
        </div>
      </div>

      {/* Print header (only shows on print) */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">Weekly Shop Report — {weekLabel}</h2>
        {settings?.bookkeeper_name && (
          <p className="text-sm text-gray-500">For: {settings.bookkeeper_name} ({settings.bookkeeper_email})</p>
        )}
      </div>

      <div ref={printRef} className="space-y-6">

        {/* ── Per-shop grids ── */}
        {shops.map(shop => {
          const rows = weekDays.map(d =>
            daily[`${shop.id}_${format(d, 'yyyy-MM-dd')}`]
            ?? emptyDaily(shop.id, format(d, 'yyyy-MM-dd'))
          )

          const shopNetSales  = rows.map(netSales)
          const shopVariances = rows.map(variance)

          return (
            <div key={shop.id} className="bg-white rounded-xl shadow border overflow-x-auto">
              <div className="bg-blue-700 text-white px-4 py-2.5 font-semibold rounded-t-xl">
                {shop.name}
              </div>

              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-600">
                    <th className="text-left px-3 py-2 w-24">Field</th>
                    {dayHeaders.map(h => (
                      <th key={h} className="text-center px-1 py-2 w-[90px]">{h}</th>
                    ))}
                    <th className="text-right px-3 py-2 w-28 bg-blue-50 text-blue-800">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Editable fields */}
                  {FIELDS.map(({ key, label, isMoney }) => (
                    <tr key={key} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-1 font-medium text-gray-500 text-xs">{label}</td>
                      {rows.map((row, i) => (
                        <td key={i} className="px-1 py-1">
                          <input
                            type="number"
                            min="0"
                            step={key === 'customer_count' ? '1' : '0.01'}
                            value={row[key] === 0 ? '' : row[key]}
                            onChange={e => updateCell(shop.id, row.report_date, key, e.target.value)}
                            placeholder="0"
                            className="no-print w-full border rounded px-1.5 py-1 text-right text-sm
                              focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          {/* Print value */}
                          <span className="hidden print:block text-right">
                            {isMoney ? fmtMoney(row[key] as number) : row[key] || '—'}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-1 text-right font-semibold bg-blue-50 text-blue-900">
                        {isMoney
                          ? fmtMoney(colSum(rows, key))
                          : key === 'hours'
                            ? colSum(rows, key).toFixed(2)
                            : colSum(rows, key).toString()
                        }
                      </td>
                    </tr>
                  ))}

                  {/* Net Sales row — calculated */}
                  <tr className="border-b bg-emerald-50">
                    <td className="px-3 py-1 font-semibold text-emerald-700 text-xs">Net Sales</td>
                    {shopNetSales.map((ns, i) => (
                      <td key={i} className="px-2 py-1 text-right text-sm font-medium text-emerald-700">
                        {fmtMoney(ns)}
                      </td>
                    ))}
                    <td className="px-3 py-1 text-right font-bold bg-emerald-100 text-emerald-800">
                      {fmtMoney(shopNetSales.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>

                  {/* Variance row — calculated, coloured */}
                  <tr className="border-b">
                    <td className="px-3 py-1 font-semibold text-gray-500 text-xs">Variance</td>
                    {shopVariances.map((v, i) => (
                      <td key={i} className={`px-2 py-1 text-right text-sm font-medium
                        ${v !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmtMoney(v)}
                      </td>
                    ))}
                    <td className={`px-3 py-1 text-right font-bold
                      ${shopVariances.reduce((a,b)=>a+b,0) !== 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {fmtMoney(shopVariances.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>

                  {/* Weekly wages — single input */}
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td className="px-3 py-2 font-semibold text-amber-800 text-xs">
                      Wages<br/>
                      <span className="font-normal text-amber-600">(weekly)</span>
                    </td>
                    <td colSpan={7} className="px-2 py-1">
                      <div className="flex items-center gap-2 no-print">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wages[shop.id] === 0 ? '' : wages[shop.id]}
                          onChange={e => updateWage(shop.id, e.target.value)}
                          placeholder="0.00"
                          className="w-36 border rounded px-2 py-1 text-right text-sm
                            focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <span className="hidden print:block text-sm font-medium">
                        {fmtMoney(wages[shop.id] ?? 0)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold bg-amber-100 text-amber-900">
                      {fmtMoney(wages[shop.id] ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}

        {/* ── Combined Totals ── */}
        <div className="bg-white rounded-xl shadow border overflow-x-auto">
          <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold rounded-t-xl">
            Combined — All Shops
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Total Sales',     value: fmtMoney(combined.totalSales),     highlight: false },
                { label: 'Total GST',       value: fmtMoney(combined.totalGst),       highlight: false },
                { label: 'Net Sales',       value: fmtMoney(combined.totalNetSales),  highlight: 'green' },
                { label: 'Total Eftpos',    value: fmtMoney(combined.totalEftpos),    highlight: false },
                { label: 'Total Cash',      value: fmtMoney(combined.totalCash),      highlight: false },
                { label: 'Total Paid Out',  value: fmtMoney(combined.totalPaidOut),   highlight: false },
                { label: 'Variance',        value: fmtMoney(combined.totalVariance),
                  highlight: combined.totalVariance !== 0 ? 'red' : 'green' },
                { label: 'Total Customers', value: combined.totalCustomers.toString(), highlight: false },
                { label: 'Total Hours',     value: `${combined.totalHours.toFixed(2)}h`, highlight: false },
                { label: 'Total Wages',     value: fmtMoney(combined.totalWages),     highlight: 'amber' },
                { label: 'Wages % of Net Sales',
                  value: `${combined.wagesPct}%`,
                  highlight: parseFloat(combined.wagesPct) > 35 ? 'red' : 'green' },
              ].map(({ label, value, highlight }) => (
                <tr key={label} className={`border-b
                  ${highlight === 'green' ? 'bg-emerald-50' : ''}
                  ${highlight === 'red'   ? 'bg-red-50'     : ''}
                  ${highlight === 'amber' ? 'bg-amber-50'   : ''}
                `}>
                  <td className="px-4 py-2 font-medium text-gray-600 w-48">{label}</td>
                  <td className={`px-4 py-2 text-right font-bold text-lg
                    ${highlight === 'green' ? 'text-emerald-700' : ''}
                    ${highlight === 'red'   ? 'text-red-700'     : ''}
                    ${highlight === 'amber' ? 'text-amber-800'   : ''}
                    ${!highlight            ? 'text-gray-800'    : ''}
                  `}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && settings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">⚙️ Report Settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bookkeeper Name
                </label>
                <input
                  type="text"
                  value={settings.bookkeeper_name}
                  onChange={e => setSettings({ ...settings, bookkeeper_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="e.g. Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bookkeeper Email
                </label>
                <input
                  type="email"
                  value={settings.bookkeeper_email}
                  onChange={e => setSettings({ ...settings, bookkeeper_email: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="bookkeeper@example.com"
                />
              </div>
              <p className="text-xs text-gray-400">
                Email is saved for future use when auto-send is enabled.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSettings(false)}
                  className="px-4 py-2 border rounded text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingSettings}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}