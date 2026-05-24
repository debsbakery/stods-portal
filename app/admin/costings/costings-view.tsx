'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Search, AlertTriangle, CheckCircle, XCircle, DollarSign } from 'lucide-react'
import type { ProductCosting } from '@/lib/costings'

interface Props {
  costings: ProductCosting[]
  globalLabourPct: number
  overheadPerKg: number
}

export default function CostingsView({ costings, globalLabourPct, overheadPerKg }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'good' | 'warning' | 'danger' | 'no-data'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  function marginColor(margin: number | null): string {
    if (margin === null) return 'text-gray-400'
    if (margin >= 10) return 'text-green-600'
    if (margin >= 0)  return 'text-amber-600'
    return 'text-red-600'
  }

  function marginBadge(margin: number | null) {
    if (margin === null) return (
      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">No data</span>
    )
    if (margin >= 10) return (
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />{margin.toFixed(1)}%
      </span>
    )
    if (margin >= 0) return (
      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />{margin.toFixed(1)}%
      </span>
    )
    return (
      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
        <XCircle className="h-3 w-3" />{margin.toFixed(1)}%
      </span>
    )
  }

  const filtered = costings.filter(c => {
    const matchSearch =
      (c.product_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (c.product_code ?? '').includes(search)

    const matchFilter =
      filter === 'all'     ? true :
      filter === 'good'    ? (c.margin_pct !== null && c.margin_pct >= 10) :
      filter === 'warning' ? (c.margin_pct !== null && c.margin_pct >= 0 && c.margin_pct < 10) :
      filter === 'danger'  ? (c.margin_pct !== null && c.margin_pct < 0) :
      c.margin_pct === null

    return matchSearch && matchFilter
  })

  const goodCount    = costings.filter(c => c.margin_pct !== null && c.margin_pct >= 10).length
  const warningCount = costings.filter(c => c.margin_pct !== null && c.margin_pct >= 0 && c.margin_pct < 10).length
  const dangerCount  = costings.filter(c => c.margin_pct !== null && c.margin_pct < 0).length
  const noDataCount  = costings.filter(c => c.margin_pct === null).length

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Costings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Labour: {globalLabourPct}% of sale price &bull;
            Overhead: ${overheadPerKg}/kg
          </p>
        </div>
        <a
          href="/admin/products/price-update"
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 shadow-md text-sm whitespace-nowrap"
        >
          <DollarSign className="h-4 w-4" />
          Price Rise Tool
        </a>
      </div>

      {/* ── Summary Badges ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setFilter(filter === 'good' ? 'all' : 'good')}
          className={`rounded-lg border p-4 text-center transition ${
            filter === 'good' ? 'ring-2 ring-green-500' : ''
          } bg-green-50 border-green-200`}
        >
          <p className="text-2xl font-bold text-green-700">{goodCount}</p>
          <p className="text-xs font-medium text-green-600 mt-1">Healthy (10%+)</p>
        </button>
        <button
          onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
          className={`rounded-lg border p-4 text-center transition ${
            filter === 'warning' ? 'ring-2 ring-amber-500' : ''
          } bg-amber-50 border-amber-200`}
        >
          <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
          <p className="text-xs font-medium text-amber-600 mt-1">Low Margin (0-10%)</p>
        </button>
        <button
          onClick={() => setFilter(filter === 'danger' ? 'all' : 'danger')}
          className={`rounded-lg border p-4 text-center transition ${
            filter === 'danger' ? 'ring-2 ring-red-500' : ''
          } bg-red-50 border-red-200`}
        >
          <p className="text-2xl font-bold text-red-700">{dangerCount}</p>
          <p className="text-xs font-medium text-red-600 mt-1">Loss Making</p>
        </button>
        <button
          onClick={() => setFilter(filter === 'no-data' ? 'all' : 'no-data')}
          className={`rounded-lg border p-4 text-center transition ${
            filter === 'no-data' ? 'ring-2 ring-gray-400' : ''
          } bg-gray-50 border-gray-200`}
        >
          <p className="text-2xl font-bold text-gray-600">{noDataCount}</p>
          <p className="text-xs font-medium text-gray-500 mt-1">No Data</p>
        </button>
      </div>

      {/* ── Search ───────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 border border-gray-300 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Product</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Sale Price</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Ingredients</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Labour</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Overhead</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Total Cost</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Profit</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Margin</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(c => (
              <>
                <tr
                  key={c.product_id}
                  className="hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => setExpanded(expanded === c.product_id ? null : c.product_id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.product_name}</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {c.product_code ? `#${c.product_code}` : '—'}
                      {c.weight_grams ? ` · ${c.weight_grams}g` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${c.sale_price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-blue-600">
                    {c.ingredient_cost != null ? `$${c.ingredient_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-purple-600">
                    {c.labour_cost != null ? `$${c.labour_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-orange-600">
                    {c.overhead_cost != null ? `$${c.overhead_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {c.total_cost != null ? `$${c.total_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${marginColor(c.margin_pct)}`}>
                    {c.net_profit != null ? `$${c.net_profit.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {marginBadge(c.margin_pct)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {expanded === c.product_id
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                    }
                  </td>
                </tr>

                {/* ── Expanded ingredient detail ── */}
                {expanded === c.product_id && (
                  <tr key={`${c.product_id}-detail`}>
                    <td colSpan={9} className="px-4 py-0 bg-indigo-50">
                      <div className="py-4 space-y-2">

                        {!c.has_recipe && (
                          <p className="text-sm text-amber-600 italic">
                            No recipe linked — add a recipe to see ingredient breakdown.
                          </p>
                        )}

                        {c.has_recipe && !c.weight_grams && (
                          <p className="text-sm text-amber-600 italic">
                            No product weight set — add weight_grams to calculate per-unit cost.
                          </p>
                        )}

                        {c.ingredient_lines.length > 0 && (
                          <div className="bg-white rounded-lg border border-indigo-100 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-indigo-50">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold text-indigo-700">Ingredient</th>
                                  <th className="text-right px-3 py-2 font-semibold text-indigo-700">Qty (g)</th>
                                  <th className="text-right px-3 py-2 font-semibold text-indigo-700">Cost</th>
                                  <th className="text-right px-3 py-2 font-semibold text-indigo-700">% of Ingr.</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {c.ingredient_lines.map((line, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-700">{line.name}</td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                                      {line.quantity_grams.toFixed(1)}g
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-700">
                                      ${line.cost.toFixed(3)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-500">
                                      {c.ingredient_cost && c.ingredient_cost > 0
                                        ? `${((line.cost / c.ingredient_cost) * 100).toFixed(1)}%`
                                        : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-indigo-50 border-t border-indigo-100">
                                <tr>
                                  <td className="px-3 py-2 font-semibold text-indigo-700">Total Ingredients</td>
                                  <td className="px-3 py-2 text-right font-mono font-semibold text-indigo-700">
                                    {c.ingredient_lines.reduce((s, l) => s + l.quantity_grams, 0).toFixed(1)}g
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-semibold text-indigo-700">
                                    ${c.ingredient_cost?.toFixed(3)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}

                        {/* Cost breakdown bar */}
                        {c.total_cost != null && c.sale_price > 0 && (
                          <div className="mt-3">
                            <div className="flex text-xs text-gray-500 mb-1 gap-4">
                              <span className="text-blue-600">
                                Ingredients {((c.ingredient_cost! / c.sale_price) * 100).toFixed(1)}%
                              </span>
                              <span className="text-purple-600">
                                Labour {((c.labour_cost! / c.sale_price) * 100).toFixed(1)}%
                              </span>
                              <span className="text-orange-600">
                                Overhead {((c.overhead_cost! / c.sale_price) * 100).toFixed(1)}%
                              </span>
                              <span className={marginColor(c.margin_pct)}>
                                Profit {c.margin_pct?.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-400"
                                style={{ width: `${(c.ingredient_cost! / c.sale_price) * 100}%` }}
                              />
                              <div
                                className="bg-purple-400"
                                style={{ width: `${(c.labour_cost! / c.sale_price) * 100}%` }}
                              />
                              <div
                                className="bg-orange-400"
                                style={{ width: `${(c.overhead_cost! / c.sale_price) * 100}%` }}
                              />
                              <div
                                className="bg-green-400 flex-1"
                              />
                            </div>
                          </div>
                        )}

                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No products match your search.
          </div>
        )}
      </div>
    </div>
  )
}