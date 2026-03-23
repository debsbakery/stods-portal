// app/admin/shop-reports/[weekStart]/page.tsx  — STODS ONLY
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { format } from 'date-fns'
import {
  parseWeekStart, getWeekDays, formatWeekStart,
  formatWeekLabel, prevWeek, nextWeek
} from '@/lib/week-utils'

interface Shop {
  id: string
  name: string
  sort_order: number
  auto_gst: boolean
}

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

interface Settings {
  id: string
  bookkeeper_email: string
  bookkeeper_name: string
  weekly_overhead: number
}

type DailyKey = keyof Omit<DailyRow, 'shop_id' | 'report_date'>

const FIELDS: { key: DailyKey; label: string; isMoney: boolean }[] = [
  { key: 'sales',          label: 'Sales',          isMoney: true  },
  { key: 'gst',            label: 'GST',            isMoney: true  },
  { key: 'eftpos',         label: 'Eftpos',         isMoney: true  },
  { key: 'cash',           label: 'Cash',           isMoney: true  },
  { key: 'paid_out',       label: 'Paid Out',       isMoney: true  },
  { key: 'actual_banking', label: 'Actual Banking', isMoney: true  },
  { key: 'purchases',      label: 'Purchases',      isMoney: true  },
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
function colSum(rows: DailyRow[], key: DailyKey): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function netSales(row: DailyRow)  { return row.sales - row.gst }
function variance(row: DailyRow)  { return row.sales - row.eftpos - row.actual_banking - row.paid_out }
function fmtMoney(n: number)      { return `$${n.toFixed(2)}` }
function fmtPct(n: number)        { return `${n.toFixed(1)}%` }
function pct(val: number, base: number) { return base > 0 ? (val / base) * 100 : 0 }

export default function WeeklyShopReport() {
  const { weekStart: param } = useParams<{ weekStart: string }>()
  const router  = useRouter()
  const supabase = createClientComponentClient()

  const weekStart  = parseWeekStart(param)
  const weekDays   = getWeekDays(weekStart)
  const weekLabel  = formatWeekLabel(weekStart)
  const dayHeaders = weekDays.map(d => format(d, 'EEE d/M'))

  const [shops,          setShops]          = useState<Shop[]>([])
  const [daily,          setDaily]          = useState<Record<string, DailyRow>>({})
  const [wages,          setWages]          = useState<Record<string, number>>({})
  const [settings,       setSettings]       = useState<Settings | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [isDirty,        setIsDirty]        = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [wagesVisible,   setWagesVisible]   = useState(false)   // 🔒 wages privacy toggle
  const [toast,          setToast]          = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const dailyKey = (shopId: string, date: string) => `${shopId}__${date}`

  const getRow = useCallback((shopId: string, date: string): DailyRow => {
    return daily[dailyKey(shopId, date)] ?? emptyDaily(shopId, date)
  }, [daily])

  // ── load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: shopData } = await supabase
        .from('shops')
        .select('id, name, sort_order, auto_gst')
        .order('sort_order')
      if (shopData) setShops(shopData)

      const { data: settingsData } = await supabase
        .from('report_settings')
        .select('id, bookkeeper_email, bookkeeper_name, weekly_overhead')
        .single()
      if (settingsData) setSettings(settingsData)

      const dateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'))
      const { data: dailyData } = await supabase
        .from('shop_daily_reports')
        .select('*')
        .in('report_date', dateStrings)
      if (dailyData) {
        const map: Record<string, DailyRow> = {}
        dailyData.forEach(r => { map[dailyKey(r.shop_id, r.report_date)] = r })
        setDaily(map)
      }

      const ws = formatWeekStart(weekStart)
      const { data: wageData } = await supabase
        .from('shop_weekly_wages')
        .select('shop_id, wages')
        .eq('week_start', ws)
      if (wageData) {
        const wmap: Record<string, number> = {}
        wageData.forEach(w => { wmap[w.shop_id] = w.wages })
        setWages(wmap)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param])

  // ── auto-save (debounced 2s) ──────────────────────────────────────────────
 const scheduleSave = useCallback(() => {
  setIsDirty(true)
  if (saveTimer.current) clearTimeout(saveTimer.current)
  saveTimer.current = setTimeout(() => {
    if (saveAllRef.current) saveAllRef.current()   // ✅ fixed
  }, 2000)
}, [])

  const saveAllRef = useRef<() => Promise<void>>()

  const saveAll = useCallback(async () => {
    setSaving(true)
    const dateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'))
    const rows = shops.flatMap(shop =>
      dateStrings.map(date => ({
        ...getRow(shop.id, date),
        shop_id: shop.id,
        report_date: date,
      }))
    )
    const { error: dailyErr } = await supabase
      .from('shop_daily_reports')
      .upsert(rows, { onConflict: 'shop_id,report_date' })

    const ws = formatWeekStart(weekStart)
    const wageRows = shops.map(shop => ({
      shop_id: shop.id,
      week_start: ws,
      wages: wages[shop.id] ?? 0,
    }))
    const { error: wageErr } = await supabase
      .from('shop_weekly_wages')
      .upsert(wageRows, { onConflict: 'shop_id,week_start' })

    setSaving(false)
    setIsDirty(false)
    if (!dailyErr && !wageErr) showToast('✅ Saved')
    else showToast('❌ Save error — check console')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, wages, shops, weekStart])

  useEffect(() => { saveAllRef.current = saveAll }, [saveAll])

  // ── field change ─────────────────────────────────────────────────────────
  function handleChange(shopId: string, date: string, field: DailyKey, raw: string) {
    const val = raw === '' ? 0 : parseFloat(raw) || 0
    const key = dailyKey(shopId, date)
    const existing = daily[key] ?? emptyDaily(shopId, date)

    // auto_gst: if sales changed on auto_gst shop, compute gst = sales/11
    const shop = shops.find(s => s.id === shopId)
    const updates: Partial<DailyRow> = { [field]: val }
    if (shop?.auto_gst && field === 'sales') {
      updates.gst = parseFloat((val / 11).toFixed(2))
    }

    setDaily(prev => ({
      ...prev,
      [key]: { ...existing, ...updates }
    }))
    scheduleSave()
  }

  function handleWageChange(shopId: string, raw: string) {
    const val = raw === '' ? 0 : parseFloat(raw) || 0
    setWages(prev => ({ ...prev, [shopId]: val }))
    scheduleSave()
  }

  // ── settings save ─────────────────────────────────────────────────────────
  async function saveSettings() {
    if (!settings) return
    setSavingSettings(true)
    const { error } = await supabase
      .from('report_settings')
      .update({
        bookkeeper_email: settings.bookkeeper_email,
        bookkeeper_name:  settings.bookkeeper_name,
        weekly_overhead:  settings.weekly_overhead,
      })
      .eq('id', settings.id)
    setSavingSettings(false)
    if (!error) showToast('✅ Settings saved')
    else showToast('❌ Settings error')
  }

  // ── combined totals ───────────────────────────────────────────────────────
  function combined() {
    const dateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'))
    let totalSales = 0, totalGst = 0, totalNet = 0, totalEftpos = 0
    let totalCash = 0, totalBanking = 0, totalPurchases = 0
    let totalCustomers = 0, totalHours = 0, totalVariance = 0
    let totalWages = 0

    shops.forEach(shop => {
      const rows = dateStrings.map(d => getRow(shop.id, d))
      totalSales     += colSum(rows, 'sales')
      totalGst       += colSum(rows, 'gst')
      totalNet       += rows.reduce((a, r) => a + netSales(r), 0)
      totalEftpos    += colSum(rows, 'eftpos')
      totalCash      += colSum(rows, 'cash')
      totalBanking   += colSum(rows, 'actual_banking')
      totalPurchases += colSum(rows, 'purchases')
      totalCustomers += colSum(rows, 'customer_count')
      totalHours     += colSum(rows, 'hours')
      totalVariance  += rows.reduce((a, r) => a + variance(r), 0)
      totalWages     += wages[shop.id] ?? 0
    })

    const overhead   = settings?.weekly_overhead ?? 0
    const totalCost  = totalWages + totalPurchases + overhead
    const profit     = totalNet - totalCost
    const wagesPct   = pct(totalWages, totalNet)
    const purchPct   = pct(totalPurchases, totalNet)
    const overheadPct = pct(overhead, totalNet)
    const profitPct  = pct(profit, totalNet)

    return {
      totalSales, totalGst, totalNet, totalEftpos, totalCash,
      totalBanking, totalPurchases, totalCustomers, totalHours,
      totalVariance, totalWages, overhead, totalCost,
      profit, wagesPct, purchPct, overheadPct, profitPct
    }
  }

  const c = combined()
    // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-full">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <button onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(prevWeek(weekStart))}`)}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">← Prev</button>
        <h1 className="text-xl font-bold text-gray-800">📊 Weekly Shop Report — {weekLabel}</h1>
        <button onClick={() => router.push(`/admin/shop-reports/${formatWeekStart(nextWeek(weekStart))}`)}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Next →</button>

        <div className="ml-auto flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600">Unsaved changes…</span>}
          {saving  && <span className="text-xs text-blue-600">Saving…</span>}

          {/* 🔒 Wages visibility toggle */}
          <button
            onClick={() => setWagesVisible(v => !v)}
            className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50"
            title={wagesVisible ? 'Hide individual wages' : 'Show individual wages'}
          >
            {wagesVisible ? '🔓 Hide Wages' : '🔒 Wages'}
          </button>

         <button
  onClick={() => { if (saveAllRef.current) saveAllRef.current() }}
  disabled={saving}
  className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50">
  {saving ? 'Saving…' : '💾 Save'}
</button>
          <button onClick={() => window.print()}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">🖨️ Print</button>
          <button onClick={() => setShowSettings(v => !v)}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">⚙️ Settings</button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && settings && (
        <div className="mb-6 p-4 border rounded bg-gray-50 print:hidden">
          <h2 className="font-semibold text-gray-700 mb-3">⚙️ Report Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Bookkeeper Name</label>
              <input value={settings.bookkeeper_name}
                onChange={e => setSettings(s => s ? { ...s, bookkeeper_name: e.target.value } : s)}
                className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Bookkeeper Email</label>
              <input value={settings.bookkeeper_email}
                onChange={e => setSettings(s => s ? { ...s, bookkeeper_email: e.target.value } : s)}
                className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Weekly Overhead ($)</label>
              <input type="number" value={settings.weekly_overhead}
                onChange={e => setSettings(s => s ? { ...s, weekly_overhead: parseFloat(e.target.value) || 0 } : s)}
                className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
          </div>
          <button onClick={saveSettings} disabled={savingSettings}
            className="mt-3 px-4 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50">
            {savingSettings ? 'Saving…' : '💾 Save Settings'}
          </button>
        </div>
      )}

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Stods Bakery — Weekly Shop Report</h1>
        <p className="text-gray-600">{weekLabel}</p>
      </div>

      {/* ── Per-shop tables ── */}
      {shops.map(shop => {
        const dateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'))
        const rows = dateStrings.map(d => getRow(shop.id, d))
        const shopWages = wages[shop.id] ?? 0

        return (
          <div key={shop.id} className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-2">
              🏪 {shop.name}
              {shop.auto_gst && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Auto GST (÷11)
                </span>
              )}
            </h2>

            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-2 py-1.5 text-left border font-medium text-gray-600 w-28">Field</th>
                    {dayHeaders.map(h => (
                      <th key={h} className="px-2 py-1.5 text-right border font-medium text-gray-600 w-24">{h}</th>
                    ))}
                    <th className="px-3 py-1.5 text-right border font-semibold bg-amber-50 text-amber-800 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(f => (
                    <tr key={f.key} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1 border text-gray-600 font-medium">{f.label}</td>
                      {dateStrings.map(date => {
                        const row = getRow(shop.id, date)
                        const isAutoGstField = shop.auto_gst && f.key === 'gst'
                        return (
                          <td key={date} className="border px-1 py-0.5">
                            {isAutoGstField ? (
                              // read-only computed gst for auto_gst shops
                              <span className="block text-right px-1 py-1 text-blue-600 text-xs">
                                {fmtMoney(row.gst)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step={f.isMoney ? '0.01' : '1'}
                                min="0"
                                value={row[f.key] === 0 ? '' : row[f.key]}
                                onChange={e => handleChange(shop.id, date, f.key, e.target.value)}
                                className="w-full text-right px-1 py-1 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 text-xs"
                                placeholder="0"
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1 text-right font-semibold bg-amber-50 text-amber-900 border">
                        {f.isMoney ? fmtMoney(colSum(rows, f.key)) : colSum(rows, f.key).toFixed(0)}
                      </td>
                    </tr>
                  ))}

                  {/* Net Sales row */}
                  <tr className="bg-green-50 border-b">
                    <td className="px-2 py-1 border text-green-800 font-semibold">Net Sales</td>
                    {dateStrings.map(date => (
                      <td key={date} className="px-3 py-1 text-right text-green-700 font-medium border text-xs">
                        {fmtMoney(netSales(getRow(shop.id, date)))}
                      </td>
                    ))}
                    <td className="px-3 py-1 text-right font-bold bg-green-100 text-green-900 border">
                      {fmtMoney(rows.reduce((a, r) => a + netSales(r), 0))}
                    </td>
                  </tr>

                  {/* Variance row */}
                  <tr className="bg-gray-50 border-b">
                    <td className="px-2 py-1 border text-gray-600 font-medium">Variance</td>
                    {dateStrings.map(date => {
                      const v = variance(getRow(shop.id, date))
                      return (
                        <td key={date} className={`px-3 py-1 text-right font-medium border text-xs ${Math.abs(v) > 0.05 ? 'text-red-600' : 'text-gray-500'}`}>
                          {fmtMoney(v)}
                        </td>
                      )
                    })}
                    <td className={`px-3 py-1 text-right font-bold border ${Math.abs(rows.reduce((a,r)=>a+variance(r),0)) > 0.05 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {fmtMoney(rows.reduce((a, r) => a + variance(r), 0))}
                    </td>
                  </tr>

                  {/* Wages row — 🔒 masked when wagesVisible = false */}
                  <tr className="border-b bg-purple-50">
                    <td className="px-2 py-1 border text-purple-800 font-medium">Wages (week)</td>
                    <td colSpan={weekDays.length} className="px-2 py-1 border">
                      {/* Input visible when unlocked, masked when locked */}
                      <div className="flex items-center gap-2">
                        {wagesVisible ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={shopWages === 0 ? '' : shopWages}
                            onChange={e => handleWageChange(shop.id, e.target.value)}
                            className="w-32 text-right px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-purple-400 text-xs"
                            placeholder="0.00"
                          />
                        ) : (
                          <span className="text-purple-400 tracking-widest text-sm select-none">••••••</span>
                        )}
                        <span className="text-xs text-purple-500 print:hidden">
                          {wagesVisible ? '(click 🔒 Wages to hide)' : '(click 🔒 Wages to edit)'}
                        </span>
                        {/* Print always shows real value */}
                        <span className="hidden print:inline text-purple-800 font-medium">
                          {fmtMoney(shopWages)}
                        </span>
                      </div>
                    </td>
                    {/* Total wages cell — masked on screen, real on print */}
                    <td className="px-3 py-1 text-right font-bold bg-purple-100 text-purple-900 border">
                      <span className={wagesVisible ? '' : 'print:hidden'}>
                        {wagesVisible ? fmtMoney(shopWages) : <span className="text-purple-300 tracking-widest">••••••</span>}
                      </span>
                      <span className="hidden print:inline">{fmtMoney(shopWages)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* ── Combined Summary ── */}
      <div className="mt-8 border-t-2 pt-6">
        <h2 className="text-base font-bold text-gray-800 mb-4">📈 Combined Summary — All Shops</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Revenue */}
          <div className="border rounded overflow-hidden">
            <div className="bg-gray-700 text-white px-4 py-2 text-sm font-semibold">Revenue</div>
            <table className="w-full text-sm">
              <tbody>
                {[
                  ['Total Sales (inc GST)', fmtMoney(c.totalSales)],
                  ['Total GST',             fmtMoney(c.totalGst)],
                  ['Net Sales (ex GST)',    fmtMoney(c.totalNet)],
                  ['Eftpos',                fmtMoney(c.totalEftpos)],
                  ['Cash Banking',          fmtMoney(c.totalBanking)],
                  ['Variance',              fmtMoney(c.totalVariance)],
                  ['Customers',             c.totalCustomers.toString()],
                  ['Hours',                 c.totalHours.toFixed(1)],
                ].map(([label, value]) => (
                  <tr key={label} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{label}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${label === 'Variance' && Math.abs(c.totalVariance) > 0.05 ? 'text-red-600' : 'text-gray-800'}`}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Profit Analysis — wages total always visible */}
          <div className="border rounded overflow-hidden">
            <div className="bg-amber-700 text-white px-4 py-2 text-sm font-semibold">Profit Analysis</div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">Net Sales</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmtMoney(c.totalNet)}</td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs">100%</td>
                </tr>
                {/* ✅ Total Wages — ALWAYS VISIBLE regardless of wagesVisible */}
                <tr className="border-b hover:bg-gray-50 bg-purple-50">
                  <td className="px-4 py-2 text-purple-800 font-medium">Total Wages</td>
                  <td className="px-4 py-2 text-right font-semibold text-purple-900">{fmtMoney(c.totalWages)}</td>
                  <td className="px-4 py-2 text-right text-purple-600 text-xs">{fmtPct(c.wagesPct)}</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">Purchases</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmtMoney(c.totalPurchases)}</td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs">{fmtPct(c.purchPct)}</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">Overhead</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmtMoney(c.overhead)}</td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs">{fmtPct(c.overheadPct)}</td>
                </tr>
                <tr className="border-b hover:bg-gray-50 bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium">Total Cost</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmtMoney(c.totalCost)}</td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs"></td>
                </tr>
                <tr className={`border-b ${c.profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <td className={`px-4 py-2 font-bold ${c.profit >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                    {c.profit >= 0 ? '✅ Net Profit' : '❌ Net Loss'}
                  </td>
                  <td className={`px-4 py-2 text-right font-bold text-lg ${c.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {fmtMoney(c.profit)}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm font-semibold ${c.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmtPct(Math.abs(c.profitPct))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Print footer */}
      <div className="hidden print:block mt-8 text-xs text-gray-400 border-t pt-2">
        Printed {format(new Date(), 'dd/MM/yyyy HH:mm')}
        {settings?.bookkeeper_name && ` — Bookkeeper: ${settings.bookkeeper_name}`}
      </div>
    </div>
  )
}