'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'

interface Shop { id: string; name: string; sort_order: number }

interface WeekData {
  week_start: string
  order_revenue: number
  order_count: number
  ingredient_cost: number
  overhead: number
  shop_sales: Record<string, number>
  shop_total_sales: number
  bakery_wages: number
  shop_wages: number
  shop_purchases: number
  shop_overhead: number
}

interface MonthData {
  monthKey: string
  label: string
  weeks: WeekData[]
}

interface Props { months: MonthData[]; shops: Shop[] }

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const fmtWeek = (ws: string) => {
  const start = new Date(ws + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
}

function sumWeeks(weeks: WeekData[]) {
  return weeks.reduce((acc, w) => {
    const wholesaleCosts = w.ingredient_cost + w.overhead + w.bakery_wages
    const shopCosts = w.shop_wages + w.shop_purchases + w.shop_overhead
    return {
      order_revenue: acc.order_revenue + w.order_revenue,
      order_count: acc.order_count + w.order_count,
      ingredient_cost: acc.ingredient_cost + w.ingredient_cost,
      overhead: acc.overhead + w.overhead,
      bakery_wages: acc.bakery_wages + w.bakery_wages,
      shop_total_sales: acc.shop_total_sales + w.shop_total_sales,
      shop_wages: acc.shop_wages + w.shop_wages,
      shop_purchases: acc.shop_purchases + w.shop_purchases,
      shop_overhead: acc.shop_overhead + w.shop_overhead,
      wholesale_costs: acc.wholesale_costs + wholesaleCosts,
      shop_costs: acc.shop_costs + shopCosts,
    }
  }, {
    order_revenue: 0, order_count: 0, ingredient_cost: 0, overhead: 0,
    bakery_wages: 0, shop_total_sales: 0, shop_wages: 0, shop_purchases: 0,
    shop_overhead: 0, wholesale_costs: 0, shop_costs: 0,
  })
}

export default function SummaryView({ months, shops }: Props) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    new Set(months.length > 0 ? [months[0].monthKey] : [])
  )

  function toggleMonth(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allWeeks = months.flatMap(m => m.weeks)
  const grand = sumWeeks(allWeeks)
  const grandTotalRev = grand.order_revenue + grand.shop_total_sales
  const grandTotalCosts = grand.wholesale_costs + grand.shop_costs
  const grandProfit = grandTotalRev - grandTotalCosts
  const grandMargin = grandTotalRev > 0 ? (grandProfit / grandTotalRev) * 100 : 0

  return (
    <div className="space-y-4 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📊 Business Summary</h1>
        <p className="text-sm text-gray-500 mt-0.5">Weekly P&L — wholesale + shop operations</p>
      </div>

      {/* Grand Total Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Card label="Wholesale Revenue" value={fmt(grand.order_revenue)} />
        <Card label="Shop Sales" value={fmt(grand.shop_total_sales)} />
        <Card label="Total Revenue" value={fmt(grandTotalRev)} color="text-blue-700" />
        <Card label="Wholesale Costs" value={fmt(grand.wholesale_costs)} color="text-red-600" sub={`Ingr ${fmt(grand.ingredient_cost)} + Wages ${fmt(grand.bakery_wages)} + OH ${fmt(grand.overhead)}`} />
        <Card label="Shop Costs" value={fmt(grand.shop_costs)} color="text-red-600" sub={`Wages ${fmt(grand.shop_wages)} + Purch ${fmt(grand.shop_purchases)}`} />
        <div className={`rounded-xl border p-3 ${grandProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-gray-500 font-medium">Net Profit</p>
          <p className={`text-lg font-bold mt-0.5 ${grandProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(grandProfit)}</p>
          <p className="text-xs text-gray-400">{grandMargin.toFixed(1)}% margin</p>
        </div>
      </div>

      {/* Monthly Sections */}
      {months.map((month, mi) => {
        const isOpen = openMonths.has(month.monthKey)
        const mt = sumWeeks(month.weeks)
        const monthTotalRev = mt.order_revenue + mt.shop_total_sales
        const monthTotalCosts = mt.wholesale_costs + mt.shop_costs
        const monthProfit = monthTotalRev - monthTotalCosts
        const monthMargin = monthTotalRev > 0 ? (monthProfit / monthTotalRev) * 100 : 0

        return (
          <div key={month.monthKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleMonth(month.monthKey)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                <h2 className="text-lg font-bold text-gray-900">{month.label}</h2>
                <span className="text-sm text-gray-400">({month.weeks.length} wks)</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Rev <strong className="text-blue-700">{fmt(monthTotalRev)}</strong></span>
                <span className="text-gray-500">Costs <strong className="text-red-600">{fmt(monthTotalCosts)}</strong></span>
                <span className={`font-bold ${monthProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmt(monthProfit)} <span className="text-xs font-normal">({monthMargin.toFixed(0)}%)</span>
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600" rowSpan={2}>Week</th>
                      <th className="text-center px-2 py-1 font-semibold text-gray-500 border-b border-gray-200" colSpan={4}>Wholesale</th>
                      <th className="text-center px-2 py-1 font-semibold text-gray-500 border-b border-gray-200" colSpan={shops.length + 3}>Shops</th>
                      <th className="text-center px-2 py-1 font-semibold text-blue-600 border-b border-gray-200" colSpan={3}>Totals</th>
                    </tr>
                    <tr>
                      {/* Wholesale */}
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Revenue</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Ingredients</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Wages</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Overhead</th>
                      {/* Shops */}
                      {shops.map(s => (
                        <th key={s.id} className="text-right px-2 py-2 font-semibold text-gray-600">{s.name}</th>
                      ))}
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Shop Wages</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Shop COGS</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">Shop OH</th>
                      {/* Totals */}
                      <th className="text-right px-2 py-2 font-semibold text-blue-600">Revenue</th>
                      <th className="text-right px-2 py-2 font-semibold text-red-600">Costs</th>
                      <th className="text-right px-2 py-2 font-semibold text-green-600">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {month.weeks.map((w, wi) => {
                      const wCosts = w.ingredient_cost + w.overhead + w.bakery_wages
                      const sCosts = w.shop_wages + w.shop_purchases + w.shop_overhead
                      const totalRev = w.order_revenue + w.shop_total_sales
                      const totalCosts = wCosts + sCosts
                      const profit = totalRev - totalCosts
                      const profitColor = profit >= 0 ? 'text-green-700' : 'text-red-700'

                      return (
                        <tr key={w.week_start} className={`hover:bg-gray-50 ${wi === 0 && mi === 0 ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                            {fmtWeek(w.week_start)}
                            {wi === 0 && mi === 0 && <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1 py-0.5 rounded-full">Now</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-gray-700">{w.order_revenue > 0 ? fmt(w.order_revenue) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-red-500">{w.ingredient_cost > 0 ? fmt(w.ingredient_cost) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-red-500">{w.bakery_wages > 0 ? fmt(w.bakery_wages) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-orange-500">{w.overhead > 0 ? fmt(w.overhead) : '—'}</td>
                          {shops.map(s => (
                            <td key={s.id} className="px-2 py-2 text-right font-mono text-gray-600">{w.shop_sales[s.id] ? fmt(w.shop_sales[s.id]) : '—'}</td>
                          ))}
                          <td className="px-2 py-2 text-right font-mono text-red-500">{w.shop_wages > 0 ? fmt(w.shop_wages) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-red-500">{w.shop_purchases > 0 ? fmt(w.shop_purchases) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-orange-500">{w.shop_overhead > 0 ? fmt(w.shop_overhead) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono font-semibold text-blue-700">{totalRev > 0 ? fmt(totalRev) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono font-semibold text-red-600">{totalCosts > 0 ? fmt(totalCosts) : '—'}</td>
                          <td className={`px-2 py-2 text-right font-mono font-bold ${profitColor}`}>{totalRev > 0 ? fmt(profit) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">
                    <tr>
                      <td className="px-3 py-2.5 text-gray-800">{month.label}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-gray-800">{fmt(mt.order_revenue)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-red-700">{fmt(mt.ingredient_cost)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-red-700">{fmt(mt.bakery_wages)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-orange-700">{fmt(mt.overhead)}</td>
                      {shops.map(s => {
                        const t = month.weeks.reduce((sum, w) => sum + (w.shop_sales[s.id] || 0), 0)
                        return <td key={s.id} className="px-2 py-2.5 text-right font-mono text-gray-700">{t > 0 ? fmt(t) : '—'}</td>
                      })}
                      <td className="px-2 py-2.5 text-right font-mono text-red-700">{fmt(mt.shop_wages)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-red-700">{fmt(mt.shop_purchases)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-orange-700">{fmt(mt.shop_overhead)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-blue-800">{fmt(monthTotalRev)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-red-800">{fmt(monthTotalCosts)}</td>
                      <td className={`px-2 py-2.5 text-right font-mono ${monthProfit >= 0 ? 'text-green-800' : 'text-red-800'}`}>{fmt(monthProfit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Card({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}