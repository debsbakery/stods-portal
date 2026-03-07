'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign,
  ShoppingCart, Users, BarChart3
} from 'lucide-react'

interface Week {
  week_start: string
  first_day: string
  last_day: string
  order_count: number
  revenue: number
  invoiced_revenue: number
  pending_revenue: number
  customer_count: number
  total_weight_kg: number
}

interface TopProduct {
  name: string
  qty: number
  revenue: number
}

interface Props {
  weeks: Week[]
  topProducts: TopProduct[]
  thisWeekStart: string
  overheadPerKg: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  })

const fmtWeek = (start: string, end: string) =>
  `${fmtDate(start)} – ${fmtDate(end)}`

export default function WeeklyReportView({ weeks, topProducts, thisWeekStart,  overheadPerKg, }: Props) {
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [actualWages, setActualWages] = useState<Record<string, string>>({})

  const current  = weeks[selectedWeek]
  const previous = weeks[selectedWeek + 1]

  const revChange = previous
    ? ((current.revenue - previous.revenue) / previous.revenue) * 100
    : null

  const ordChange = previous
    ? ((current.order_count - previous.order_count) / previous.order_count) * 100
    : null

  const maxRevenue = Math.max(...weeks.map(w => w.revenue))

  // ── Profit estimate — ALL declared in correct order ───────────
 // ── Profit estimate ───────────────────────────────────────────
const wages        = parseFloat(actualWages[current?.week_start] || '0') || 0
const wagesEntered = wages > 0
const estIngred    = current ? current.revenue * 0.30 : 0

// ✅ Weight-based overhead
const weightKg     = current ? current.total_weight_kg : 0
const hasWeightData = weightKg > 0
const estOverhead  = hasWeightData
  ? weightKg * overheadPerKg                    // actual weight × $/kg
  : (current ? current.revenue * 0.30 : 0)      // fallback to 30% if no weights

const labourCost   = wagesEntered
  ? wages
  : (current ? current.revenue * 0.30 : 0)
const totalCosts   = estIngred + labourCost + estOverhead
const estProfit    = current ? current.revenue - totalCosts : 0
const estMargin    = current && current.revenue > 0
  ? (estProfit / current.revenue) * 100
  : 0
  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Revenue Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Last {weeks.length} weeks of trading — revenue ex-GST
        </p>
      </div>

      {/* ── Week Selector ─────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {weeks.map((w, i) => (
          <button
            key={w.week_start}
            onClick={() => setSelectedWeek(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedWeek === i
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {fmtDate(w.first_day)}
            {i === 0 && (
              <span className="ml-1.5 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                Current
              </span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <>
          {/* ── Selected Week Header ──────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-bold text-gray-900">
              Week of {fmtWeek(current.first_day, current.last_day)}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {current.order_count} orders from {current.customer_count} customers
            </p>
          </div>

          {/* ── KPI Cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-medium">Revenue (ex-GST)</p>
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(current.revenue)}</p>
              {revChange !== null && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${
                  revChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {revChange >= 0
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {revChange >= 0 ? '+' : ''}{revChange.toFixed(1)}% vs last week
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-medium">Orders</p>
                <ShoppingCart className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{current.order_count}</p>
              {ordChange !== null && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${
                  ordChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {ordChange >= 0
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {ordChange >= 0 ? '+' : ''}{ordChange.toFixed(1)}% vs last week
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-medium">Avg Order</p>
                <BarChart3 className="h-5 w-5 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {fmt(current.order_count > 0 ? current.revenue / current.order_count : 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">per order</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-medium">Customers</p>
                <Users className="h-5 w-5 text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{current.customer_count}</p>
              <p className="text-xs text-gray-400 mt-1">active this week</p>
            </div>

          </div>

          {/* ── Profit Estimate ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Net Profit Estimate
              <span className="ml-2 text-xs font-normal text-gray-400">
                Ingredients + overhead = 30% estimate until recipes complete
              </span>
            </h3>

            {/* Actual wages input */}
            <div className="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-blue-700 mb-1">
                  Actual Wages Paid This Week
                </label>
                <p className="text-xs text-blue-500">
                  Enter real wages for accurate profit. Leave blank to use 30% estimate.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-semibold">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 3500"
                  value={actualWages[current.week_start] || ''}
                  onChange={e => setActualWages(prev => ({
                    ...prev,
                    [current.week_start]: e.target.value
                  }))}
                  className="w-32 border border-blue-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Revenue (ex-GST)</span>
                <span className="font-mono font-semibold text-gray-900">
                  {fmt(current.revenue)}
                </span>
              </div>
            {/* Ingredients */}
<div className="flex justify-between items-center py-2 border-b border-gray-100">
  <span className="text-sm text-gray-600">
    Est. Ingredients
    <span className="text-xs text-gray-400 ml-1">(30% est.)</span>
  </span>
  <div className="text-right">
    <span className="font-mono text-amber-600">-{fmt(estIngred)}</span>
    <span className="text-xs text-amber-500 ml-2">
      {current.revenue > 0 ? ((estIngred / current.revenue) * 100).toFixed(1) : 0}%
    </span>
  </div>
</div>

{/* Labour */}
<div className="flex justify-between items-center py-2 border-b border-gray-100">
  <div>
    <span className="text-sm text-gray-600">
      {wagesEntered ? 'Actual Wages' : 'Est. Labour'}
    </span>
    {!wagesEntered && <span className="text-xs text-gray-400 ml-1">(30% est.)</span>}
    {wagesEntered && <span className="text-xs text-blue-600 ml-1 font-medium">actual</span>}
  </div>
  <div className="text-right">
    <span className="font-mono text-blue-600">-{fmt(labourCost)}</span>
    <span className="text-xs text-blue-500 ml-2">
      {current.revenue > 0 ? ((labourCost / current.revenue) * 100).toFixed(1) : 0}%
    </span>
  </div>
</div>

{/* Overhead */}
<div className="flex justify-between items-center py-2 border-b border-gray-100">
  <span className="text-sm text-gray-600">
    Est. Overhead
    {hasWeightData
      ? <span className="text-xs text-gray-400 ml-1">({weightKg.toFixed(0)}kg × ${overheadPerKg}/kg)</span>
      : <span className="text-xs text-gray-400 ml-1">(30% est.)</span>
    }
  </span>
  <div className="text-right">
    <span className="font-mono text-purple-600">-{fmt(estOverhead)}</span>
    <span className="text-xs text-purple-500 ml-2">
      {current.revenue > 0 ? ((estOverhead / current.revenue) * 100).toFixed(1) : 0}%
    </span>
  </div>
</div>

            {/* Visual bar */}
            {current.revenue > 0 && (
              <div>
                <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-amber-400" style={{ width: '30%' }} />
                  <div
                    className="bg-blue-400"
                    style={{
                      width: `${wagesEntered
                        ? Math.min((wages / current.revenue) * 100, 100)
                        : 30}%`
                    }}
                  />
                  <div className="bg-purple-400" style={{ width: '30%' }} />
                  <div className={estProfit >= 0 ? 'bg-green-400 flex-1' : 'bg-red-400 flex-1'} />
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-400 rounded-full" />
                    Ingredients 30%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full" />
                    {wagesEntered
                      ? `Labour ${((wages / current.revenue) * 100).toFixed(1)}% (actual)`
                      : 'Labour 30% (est)'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-purple-400 rounded-full" />
                    Overhead 30%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${
                      estProfit >= 0 ? 'bg-green-400' : 'bg-red-400'
                    }`} />
                    Net Profit {estMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Invoiced vs Pending ───────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue Breakdown</h3>
            <div className="flex gap-6 mb-3">
              <div>
                <p className="text-xs text-gray-500">Invoiced</p>
                <p className="text-lg font-bold text-green-600">
                  {fmt(current.invoiced_revenue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-lg font-bold text-amber-600">
                  {fmt(current.pending_revenue)}
                </p>
              </div>
            </div>
            {current.revenue > 0 && (
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="bg-green-500"
                  style={{ width: `${(current.invoiced_revenue / current.revenue) * 100}%` }}
                />
                <div
                  className="bg-amber-400"
                  style={{ width: `${(current.pending_revenue / current.revenue) * 100}%` }}
                />
              </div>
            )}
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                Invoiced {current.revenue > 0
                  ? ((current.invoiced_revenue / current.revenue) * 100).toFixed(0)
                  : 0}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400 rounded-full" />
                Pending {current.revenue > 0
                  ? ((current.pending_revenue / current.revenue) * 100).toFixed(0)
                  : 0}%
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Weekly Bar Chart ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Week</h3>
        <div className="flex items-end gap-2 h-40">
          {[...weeks].reverse().map((w, i) => {
            const height = maxRevenue > 0 ? (w.revenue / maxRevenue) * 100 : 0
            const isSelected = w.week_start === weeks[selectedWeek]?.week_start
            return (
              <button
                key={w.week_start}
                onClick={() => setSelectedWeek(weeks.length - 1 - i)}
                className="flex-1 flex flex-col items-center gap-1 group"
              >
                <span className="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition">
                  {fmt(w.revenue)}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    isSelected ? 'bg-green-600' : 'bg-green-200 hover:bg-green-400'
                  }`}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
                <span className="text-xs text-gray-400 truncate w-full text-center">
                  {fmtDate(w.first_day)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Top Products This Week ────────────────────────────────── */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Top Products — Current Week
          </h3>
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="font-medium text-gray-800 truncate">{p.name}</span>
                    <span className="text-gray-600 font-mono ml-2">{fmt(p.revenue)}</span>
                  </div>
                  <div className="flex h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-400 rounded-full"
                      style={{ width: `${(p.revenue / topProducts[0].revenue) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{p.qty} units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All Weeks Table ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">All Weeks Summary</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Week</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Orders</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Customers</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Avg Order</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Revenue</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">vs Prior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {weeks.map((w, i) => {
              const prior  = weeks[i + 1]
              const change = prior
                ? ((w.revenue - prior.revenue) / prior.revenue) * 100
                : null
              return (
                <tr
                  key={w.week_start}
                  onClick={() => setSelectedWeek(i)}
                  className={`cursor-pointer transition ${
                    selectedWeek === i ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">
                      {fmtWeek(w.first_day, w.last_day)}
                    </span>
                    {i === 0 && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{w.order_count}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{w.customer_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600">
                    {fmt(w.order_count > 0 ? w.revenue / w.order_count : 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                    {fmt(w.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {change !== null ? (
                      <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${
                        change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {change >= 0
                          ? <TrendingUp className="h-3 w-3" />
                          : <TrendingDown className="h-3 w-3" />}
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-800">
                Total ({weeks.length} weeks)
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-800">
                {weeks.reduce((s, w) => s + w.order_count, 0)}
              </td>
              <td className="px-4 py-3 text-right text-gray-400">—</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                {fmt(
                  weeks.reduce((s, w) => s + w.revenue, 0) /
                  Math.max(weeks.reduce((s, w) => s + w.order_count, 0), 1)
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold text-green-700 text-base">
                {fmt(weeks.reduce((s, w) => s + w.revenue, 0))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}