// app/admin/shop-reports/[weekStart]/page.tsx  — STODS ONLY (has auto_gst)
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  parseWeekStart, getWeekDays, formatWeekStart,
  formatWeekLabel, prevWeek, nextWeek
} from '@/lib/week-utils'
import PriceMarginCalculator from '../price-margin-calculator'

interface Shop { id: string; name: string; sort_order: number; auto_gst: boolean }

interface DailyRow {
  shop_id: string
  report_date: string
  sales: number
  gst: number
  eftpos: number
  cash: number
  paid_out: number
  actual_banking: number
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
  weekly_overhead: number
}

const SUPPLIERS = [
  'Bega',
  'Bidfood',
  'TWD',
  'TCW',
  'Angliss',
  "Stods Bakery",
  'Coke',
  'Bou Samra',
  'Other',
]

type DailyKey = keyof Omit<DailyRow, 'shop_id' | 'report_date' | 'purchases'>

const FIELDS: { key: DailyKey; label: string; isMoney: boolean }[] = [
  { key: 'sales',          label: 'Sales',          isMoney: true  },
  { key: 'gst',            label: 'GST',            isMoney: true  },
  { key: 'eftpos',         label: 'Eftpos',         isMoney: true  },
  { key: 'cash',           label: 'Cash',           isMoney: true  },
  { key: 'paid_out',       label: 'Paid Out',       isMoney: true  },
  { key: 'actual_banking', label: 'Actual Banking', isMoney: true  },
  { key: 'customer_count', label: 'Customers',      isMoney: false },
  { key: 'hours',          label: 'Hours',          isMoney: false },
]

function emptyDaily(shopId: string, date: string): DailyRow {
  return {
    shop_id: shopId, report_date: date,
    sales: 0, gst: 0, eftpos: 0, cash: 0,
    paid_out: 0, actual_banking: 0, purchases: 0,
    customer_count: 0, hours: 0
  }
}
function colSum(rows: DailyRow[], key: keyof DailyRow): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function netSales(row: DailyRow)  { return row.sales - row.gst }
function variance(row: DailyRow)  { return row.sales - row.eftpos - row.actual_banking - row.paid_out }
function fmtMoney(n: number)      { return `$${n.toFixed(2)}` }
function fmtPct(n: number)        { return `${n.toFixed(1)}%` }
function pct(val: number, base: number) {
  return base > 0 ? (val / base) * 100 : 0
}

export default function WeeklyShopReport() {
  const { weekStart: param } = useParams<{ weekStart: string }>()
  const router = useRouter()

  const weekStart  = parseWeekStart(param)
  const weekDays   = getWeekDays(weekStart)
  const weekLabel  = formatWeekLabel(weekStart)
  const dayHeaders = weekDays.map(d => format(d, 'EEE d/M'))

  const [activeTab,      setActiveTab]      = useState<'reports' | 'calculator'>('reports')
  const [shops,          setShops]          = useState<Shop[]>([])
  const [daily,          setDaily]          = useState<Record<string, DailyRow>>({})
  const [wages,          setWages]          = useState<Record<string, number>>({})
  const [purchases,      setPurchases]      = useState<Record<string, number>>({})
  const [settings,       setSettings]       = useState<Settings | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [isDirty,        setIsDirty]        = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [wagesVisible,   setWagesVisible]   = useState(false)
  const [toast,          setToast]          = useState<{ msg: string; ok: boolean } | null>(null)

  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/admin/shop-reports/${param}`)
    const { shops: s, daily: d, wages: w, settings: st, purchases: p } = await res.json()

    setShops(s ?? [])
    setSettings(st ?? null)

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

    const purchasesMap: Record<string, number> = {}
    SUPPLIERS.forEach(sup => { purchasesMap[sup] = 0 })
    p?.forEach((row: { supplier: string; amount: number }) => {
      purchasesMap[row.supplier] = row.amount
    })
    setPurchases(purchasesMap)

    setIsDirty(false)
  }, [param])

  useEffect(() => { loadData() }, [loadData])

  function triggerAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { handleSave() }, 1500)
  }

  function updateCell(shopId: string, date: string, field: DailyKey, val: string) {
    const key   = `${shopId}_${date}`
    const value = parseFloat(val) || 0
    const shop  = shops.find(s => s.id === shopId)
    setDaily(prev => {
      const updated: DailyRow = { ...prev[key], [field]: value }
      if (field === 'sales' && shop?.auto_gst) {
        updated.gst = parseFloat((value / 11).toFixed(2))
      }
      return { ...prev, [key]: updated }
    })
    setIsDirty(true)
    triggerAutoSave()
  }

  function updateWage(shopId: string, val: string) {
    setWages(prev => ({ ...prev, [shopId]: parseFloat(val) || 0 }))
    setIsDirty(true)
    triggerAutoSave()
  }

  function updatePurchase(supplier: string, val: string) {
    setPurchases(prev => ({ ...prev, [supplier]: parseFloat(val) || 0 }))
    setIsDirty(true)
    triggerAutoSave()
  }

  async function handleSave() {
    setSaving(true)
    const dailyRows = Object.values(daily)
    const wageRows  = shops.map(s => ({
      shop_id: s.id, week_start: param, wages: wages[s.id] ?? 0
    }))
    const purchaseRows = SUPPLIERS.map(sup => ({
      week_start: param,
      supplier:   sup,
      amount:     purchases[sup] ?? 0,
    }))
    const res = await fetch(`/api/admin/shop-reports/${param}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyRows, wageRows, purchaseRows })
    })
    setSaving(false)
    if (res.ok) { showToast('✅ Week saved'); setIsDirty(false) }
    else showToast('❌ Save failed', false)
  }

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return
    setSavingSettings(true)
    const res = await fetch('/api/admin/shop-reports/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    setSavingSettings(false)
    if (res.ok) { showToast('✅ Settings saved'); setShowSettings(false) }
    else showToast('❌ Failed to save settings', false)
  }

  const totalPurchases = SUPPLIERS.reduce((a, s) => a + (purchases[s] ?? 0), 0)

  function getCombined() {
    let totalSales = 0, totalGst = 0, totalEftpos = 0, totalCash = 0,
        totalPaidOut = 0, totalActualBanking = 0,
        totalCustomers = 0, totalHours = 0, totalWages = 0

    shops.forEach(shop => {
      const rows = weekDays.map(d =>
        daily[`${shop.id}_${format(d, 'yyyy-MM-dd')}`] ?? emptyDaily(shop.id, '')
      )
      totalSales         += colSum(rows, 'sales')
      totalGst           += colSum(rows, 'gst')
      totalEftpos        += colSum(rows, 'eftpos')
      totalCash          += colSum(rows, 'cash')
      totalPaidOut       += colSum(rows, 'paid_out')
      totalActualBanking += colSum(rows, 'actual_banking')
      totalCustomers     += colSum(rows, 'customer_count')
      totalHours         += colSum(rows, 'hours')
      totalWages         += wages[shop.id] ?? 0
    })

    const overhead      = settings?.weekly_overhead ?? 2000
    const totalNetSales = totalSales - totalGst
    const totalVariance = totalSales - totalEftpos - totalActualBanking - totalPaidOut
    const grossProfit   = totalNetSales - totalPurchases
    const netProfit     = grossProfit - totalWages - overhead

    return {
      totalSales, totalGst, totalNetSales,
      totalEftpos, totalCash, totalPaidOut, totalActualBanking,
      totalVariance, totalCustomers, totalHours, totalWages, overhead,
      grossProfit, netProfit,
      wagesPct:       pct(totalWages,      totalNetSales),
      purchasesPct:   pct(totalPurchases,  totalNetSales),
      grossProfitPct: pct(grossProfit,     totalNetSales),
      overheadPct:    pct(overhead,        totalNetSales),
      netProfitPct:   pct(netProfit,       totalNetSales),
    }
  }

  const c = getCombined()

  return (
    <div className="p-4 md:p-6 max-w-full">

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
          body { font-size: 11px; }
          table { page-break-inside: avoid; }
        }
        .print-show { display: none; }
      `}</style>

      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white text-sm
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <h1 className="text-2xl font-bold text-gray-900">Shop Reports</h1>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(prevWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">◀ Prev</button>
          <span className="font-semibold text-gray-700 px-1">{weekLabel}</span>
          <button
            onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(nextWeek(weekStart))}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">Next ▶</button>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => router.push(`/admin/temperature/${param}`)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            🌡️ Temp Log
          </button>
          <button onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            ⚙️ Settings
          </button>
          <button onClick={() => window.print()}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm text-gray-600">
            🖨️ Print
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
              ${saving ? 'bg-blue-400 text-white cursor-wait'
                : isDirty ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-green-600 text-white'}`}>
            {saving ? '💾 Saving...' : isDirty ? '💾 Save Week *' : '✅ Saved'}
          </button>
        </div>
      </div>

      {/* ═══ SUB MENU TABS ═══ */}
      <div className="flex border-b mb-6 no-print">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-5 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📊 Weekly Reports
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-5 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'calculator'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          💰 Price &amp; Margin Calculator
        </button>
      </div>

      {/* ═══ CALCULATOR TAB ═══ */}
      {activeTab === 'calculator' && <PriceMarginCalculator />}

      {/* ═══ REPORTS TAB ═══ */}
      {activeTab === 'reports' && (
        <>
          {/* Print header */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold">Weekly Shop Report — {weekLabel}</h2>
            {settings?.bookkeeper_name && (
              <p className="text-sm text-gray-500">
                For: {settings.bookkeeper_name} ({settings.bookkeeper_email})
              </p>
            )}
          </div>

          <div className="space-y-6">

            {/* Per-shop grids */}
            {shops.map(shop => {
              const rows = weekDays.map(d =>
                daily[`${shop.id}_${format(d, 'yyyy-MM-dd')}`]
                ?? emptyDaily(shop.id, format(d, 'yyyy-MM-dd'))
              )
              const shopNetSales  = rows.map(netSales)
              const shopVariances = rows.map(variance)
              const totalVariance = shopVariances.reduce((a, b) => a + b, 0)
              const shopWages     = wages[shop.id] ?? 0

              return (
                <div key={shop.id} className="bg-white rounded-xl shadow border overflow-x-auto">
                  <div className="bg-blue-700 text-white px-4 py-2.5 font-semibold rounded-t-xl flex items-center gap-2">
                    {shop.name}
                    {shop.auto_gst && (
                      <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-normal">
                        GST auto ÷11
                      </span>
                    )}
                  </div>
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-600 text-xs">
                        <th className="text-left px-3 py-2 w-28">Field</th>
                        {dayHeaders.map(h => (
                          <th key={h} className="text-center px-1 py-2 w-[90px]">{h}</th>
                        ))}
                        <th className="text-right px-3 py-2 w-28 bg-blue-50 text-blue-800">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map(({ key, label, isMoney }) => {
                        const isAutoGst = key === 'gst' && shop.auto_gst
                        return (
                          <tr key={key} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-1 font-medium text-gray-500 text-xs">
                              {label}
                              {isAutoGst && (
                                <span className="ml-1 text-blue-400 text-xs">(auto)</span>
                              )}
                            </td>
                            {rows.map((row, i) => (
                              <td key={i} className="px-1 py-1">
                                {isAutoGst ? (
                                  <div className="w-full border border-blue-100 bg-blue-50 rounded px-1.5 py-1 text-right text-sm text-blue-600">
                                    {fmtMoney(row.gst)}
                                  </div>
                                ) : (
                                  <input
                                    type="number" min="0"
                                    step={key === 'customer_count' ? '1' : '0.01'}
                                    value={row[key] === 0 ? '' : row[key]}
                                    onChange={e => updateCell(shop.id, row.report_date, key, e.target.value)}
                                    placeholder="0"
                                    className="no-print w-full border rounded px-1.5 py-1 text-right text-sm
                                      focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                )}
                                <span className="hidden print:block text-right text-xs">
                                  {isMoney ? fmtMoney(row[key] as number) : row[key] || '—'}
                                </span>
                              </td>
                            ))}
                            <td className="px-3 py-1 text-right font-semibold bg-blue-50 text-blue-900 text-sm">
                              {isMoney ? fmtMoney(colSum(rows, key))
                                : key === 'hours' ? colSum(rows, key).toFixed(2)
                                : colSum(rows, key).toString()}
                            </td>
                          </tr>
                        )
                      })}

                      {/* Net Sales */}
                      <tr className="border-b bg-emerald-50">
                        <td className="px-3 py-1 font-semibold text-emerald-700 text-xs">Net Sales</td>
                        {shopNetSales.map((ns, i) => (
                          <td key={i} className="px-2 py-1 text-right text-xs font-medium text-emerald-700">
                            {fmtMoney(ns)}
                          </td>
                        ))}
                        <td className="px-3 py-1 text-right font-bold bg-emerald-100 text-emerald-800 text-sm">
                          {fmtMoney(shopNetSales.reduce((a, b) => a + b, 0))}
                        </td>
                      </tr>

                      {/* Variance */}
                      <tr className="border-b">
                        <td className="px-3 py-1 font-semibold text-gray-500 text-xs">Variance</td>
                        {shopVariances.map((v, i) => (
                          <td key={i} className={`px-2 py-1 text-right text-xs font-medium
                            ${v !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {fmtMoney(v)}
                          </td>
                        ))}
                        <td className={`px-3 py-1 text-right font-bold text-sm
                          ${totalVariance !== 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {fmtMoney(totalVariance)}
                        </td>
                      </tr>

                      {/* Wages */}
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td className="px-3 py-2 font-semibold text-amber-800 text-xs">
                          Wages<br/>
                          <span className="font-normal text-amber-600">(weekly)</span>
                        </td>
                        <td colSpan={7} className="px-2 py-1">
                          {wagesVisible ? (
                            <div className="flex items-center gap-2 no-print">
                              <span className="text-gray-400 text-sm">$</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={shopWages === 0 ? '' : shopWages}
                                onChange={e => updateWage(shop.id, e.target.value)}
                                placeholder="0.00"
                                className="w-36 border rounded px-2 py-1 text-right text-sm
                                  focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            </div>
                          ) : (
                            <span className="no-print text-amber-300 tracking-widest text-lg select-none">
                              ••••••
                            </span>
                          )}
                          <span className="print-show text-sm font-medium text-amber-800">
                            {fmtMoney(shopWages)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold bg-amber-100 text-amber-900 text-sm">
                          {wagesVisible
                            ? fmtMoney(shopWages)
                            : <span className="no-print text-amber-300 tracking-widest select-none">••••</span>
                          }
                          <span className="print-show">{fmtMoney(shopWages)}</span>
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              )
            })}

            {/* ── Purchases by Supplier ── */}
            <div className="bg-white rounded-xl shadow border overflow-hidden">
              <div className="bg-teal-700 text-white px-4 py-2.5 font-semibold rounded-t-xl flex items-center justify-between">
                <span>📦 Weekly Purchases — All Shops</span>
                <span className="text-teal-200 text-sm font-normal">
                  Total: {fmtMoney(totalPurchases)}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-600 text-xs">
                    <th className="text-left px-4 py-2">Supplier</th>
                    <th className="text-right px-4 py-2 w-48">Amount</th>
                    <th className="text-right px-4 py-2 w-24">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPLIERS.map((supplier, idx) => {
                    const amount = purchases[supplier] ?? 0
                    const supPct = totalPurchases > 0
                      ? (amount / totalPurchases * 100).toFixed(1)
                      : '0.0'
                    return (
                      <tr key={supplier}
                        className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                        <td className="px-4 py-2 font-medium text-gray-700">{supplier}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-400 text-sm no-print">$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={amount === 0 ? '' : amount}
                              onChange={e => updatePurchase(supplier, e.target.value)}
                              placeholder="0.00"
                              className="no-print w-36 border rounded px-2 py-1 text-right text-sm
                                focus:outline-none focus:ring-1 focus:ring-teal-400"
                            />
                            <span className="hidden print:block font-medium">
                              {fmtMoney(amount)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 text-sm">
                          {supPct}%
                        </td>
                      </tr>
                    )
                  })}

                  <tr className="border-t-2 bg-teal-50">
                    <td className="px-4 py-2.5 font-bold text-teal-800">Total Purchases</td>
                    <td className="px-4 py-2.5 text-right font-bold text-teal-900 text-base">
                      {fmtMoney(totalPurchases)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-teal-700">
                      100%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Combined Totals */}
            <div className="bg-white rounded-xl shadow border overflow-x-auto">
              <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold rounded-t-xl">
                Combined — All Shops
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-gray-50 border-b">
                    <td colSpan={3} className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Takings
                    </td>
                  </tr>
                  {[
                    { label: 'Total Sales',          value: fmtMoney(c.totalSales),         hl: ''      },
                    { label: 'Total GST',            value: fmtMoney(c.totalGst),           hl: ''      },
                    { label: 'Net Sales',            value: fmtMoney(c.totalNetSales),      hl: 'green' },
                    { label: 'Total Eftpos',         value: fmtMoney(c.totalEftpos),        hl: ''      },
                    { label: 'Total Cash',           value: fmtMoney(c.totalCash),          hl: ''      },
                    { label: 'Total Paid Out',       value: fmtMoney(c.totalPaidOut),       hl: ''      },
                    { label: 'Total Actual Banking', value: fmtMoney(c.totalActualBanking), hl: ''      },
                    { label: 'Variance',             value: fmtMoney(c.totalVariance),
                      hl: c.totalVariance !== 0 ? 'red' : 'green' },
                  ].map(({ label, value, hl }) => (
                    <tr key={label} className={`border-b
                      ${hl === 'green' ? 'bg-emerald-50' : ''}
                      ${hl === 'red'   ? 'bg-red-50'     : ''}
                    `}>
                      <td className="px-4 py-2 font-medium text-gray-600 w-52">{label}</td>
                      <td className={`px-4 py-2 text-right font-bold text-base
                        ${hl === 'green' ? 'text-emerald-700' : ''}
                        ${hl === 'red'   ? 'text-red-700'     : ''}
                        ${!hl           ? 'text-gray-800'    : ''}
                      `} colSpan={2}>{value}</td>
                    </tr>
                  ))}

                  <tr className="bg-gray-50 border-b border-t-2">
                    <td colSpan={3} className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Activity
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium text-gray-600">Total Customers</td>
                    <td className="px-4 py-2 text-right font-bold text-base text-gray-800" colSpan={2}>
                      {c.totalCustomers}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium text-gray-600">Total Hours</td>
                    <td className="px-4 py-2 text-right font-bold text-base text-gray-800" colSpan={2}>
                      {c.totalHours.toFixed(2)}h
                    </td>
                  </tr>

                  <tr className="bg-gray-50 border-b border-t-2">
                    <td colSpan={3} className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Profit Analysis
                    </td>
                  </tr>
                  <tr className="border-b bg-gray-100 text-xs text-gray-500 font-semibold">
                    <td className="px-4 py-1.5">Item</td>
                    <td className="px-4 py-1.5 text-right">Amount</td>
                    <td className="px-4 py-1.5 text-right">% of Net Sales</td>
                  </tr>
                  <tr className="border-b bg-amber-50">
                    <td className="px-4 py-2 font-medium text-amber-800">Total Wages</td>
                    <td className="px-4 py-2 text-right font-bold text-amber-800">
                      {fmtMoney(c.totalWages)}
                    </td>
                    <td className={`px-4 py-2 text-right font-bold
                      ${c.wagesPct > 35 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtPct(c.wagesPct)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium text-gray-600">
                      Total Purchases
                      <span className="ml-2 text-xs text-gray-400">(all suppliers)</span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-gray-800">
                      {fmtMoney(totalPurchases)}
                    </td>
                    <td className={`px-4 py-2 text-right font-bold
                      ${c.purchasesPct > 30 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtPct(c.purchasesPct)}
                    </td>
                  </tr>
                  <tr className="border-b bg-emerald-50">
                    <td className="px-4 py-2 font-semibold text-emerald-800">Gross Profit</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-800">
                      {fmtMoney(c.grossProfit)}
                    </td>
                    <td className={`px-4 py-2 text-right font-bold
                      ${c.grossProfitPct < 30 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {fmtPct(c.grossProfitPct)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium text-gray-600">Overhead (weekly fixed)</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-800">
                      {fmtMoney(c.overhead)}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-gray-500">
                      {fmtPct(c.overheadPct)}
                    </td>
                  </tr>
                  <tr className={`border-b border-t-2 ${c.netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <td className={`px-4 py-3 font-bold text-lg ${c.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      Net Profit
                    </td>
                    <td className={`px-4 py-3 text-right font-bold text-xl ${c.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      {fmtMoney(c.netProfit)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold text-xl ${c.netProfitPct >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      {fmtPct(c.netProfitPct)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && settings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">⚙️ Report Settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bookkeeper Name</label>
                <input type="text" value={settings.bookkeeper_name}
                  onChange={e => setSettings({ ...settings, bookkeeper_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bookkeeper Email</label>
                <input type="email" value={settings.bookkeeper_email}
                  onChange={e => setSettings({ ...settings, bookkeeper_email: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="bookkeeper@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weekly Overhead ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input type="number" min="0" step="0.01" value={settings.weekly_overhead}
                    onChange={e => setSettings({ ...settings, weekly_overhead: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="2000.00" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Fixed weekly overhead used in net profit calculation</p>
              </div>
              <p className="text-xs text-gray-400">Email saved for future auto-send via Resend.</p>

              <div className="flex items-center justify-between py-2 border-t mt-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">Show Individual Wages</p>
                  <p className="text-xs text-gray-400">When off, wages per shop are hidden on screen</p>
                </div>
                <button type="button" onClick={() => setWagesVisible(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${wagesVisible ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${wagesVisible ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSettings(false)}
                  className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
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