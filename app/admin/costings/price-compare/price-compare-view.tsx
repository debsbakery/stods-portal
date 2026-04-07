'use client'

import { useState, useEffect } from 'react'
import { Search, TrendingDown, TrendingUp, Loader2, BarChart3, CheckCircle } from 'lucide-react'

interface SupplierPrice {
  supplier_id: string | null
  supplier_name: string
  last_price: number
  avg_price: number
  min_price: number
  max_price: number
  purchase_count: number
  last_purchase_date: string
  is_cheapest: boolean
}

interface IngredientComparison {
  ingredient_id: string
  ingredient_name: string
  unit: string
  current_cost: number
  current_supplier: string | null
  suppliers: SupplierPrice[]
}

function formatDate(d: string) {
  if (!d) return '-'
  const date = new Date(d)
  return [
    date.getDate().toString().padStart(2, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getFullYear(),
  ].join('/')
}

export default function PriceCompareView() {
  const [comparison, setComparison]   = useState<IngredientComparison[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [suppliers, setSuppliers]     = useState<{ id: string; name: string }[]>([])
  const [expanded, setExpanded]       = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/price-compare')
      const data = await res.json()
      setComparison(data.comparison ?? [])
      setSuppliers(data.suppliers ?? [])
    } finally {
      setLoading(false)
    }
  }

  // Filter by search + supplier
  const filtered = comparison.filter(item => {
    const matchesSearch = !search || item.ingredient_name.toLowerCase().includes(search.toLowerCase())
    const matchesSupplier = !filterSupplier || item.suppliers.some(s => s.supplier_name === filterSupplier)
    return matchesSearch && matchesSupplier && item.suppliers.length > 0
  })

  // Stats
  const totalIngredients  = comparison.filter(c => c.suppliers.length > 0).length
  const multiSupplier     = comparison.filter(c => c.suppliers.length > 1).length
  const potentialSavings  = comparison
    .filter(c => c.suppliers.length > 1)
    .reduce((sum, c) => {
      const cheapest = Math.min(...c.suppliers.map(s => s.last_price))
      const current  = c.current_cost
      return sum + Math.max(0, current - cheapest)
    }, 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-green-700" />
            Price Comparison
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Compare ingredient prices across suppliers
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-green-700" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
              <p className="text-xs text-blue-500 mb-1">Ingredients with Purchase Data</p>
              <p className="text-2xl font-bold text-blue-700">{totalIngredients}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 text-center">
              <p className="text-xs text-purple-500 mb-1">Multi-Supplier Ingredients</p>
              <p className="text-2xl font-bold text-purple-700">{multiSupplier}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
              <p className="text-xs text-green-500 mb-1">Potential Savings (per unit)</p>
              <p className="text-2xl font-bold text-green-700">${potentialSavings.toFixed(2)}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search ingredients..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              />
            </div>
            <select
              value={filterSupplier}
              onChange={e => setFilterSupplier(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Results */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {search || filterSupplier
                ? 'No ingredients match your filters'
                : 'No purchase data yet — record deliveries in Inventory to see price comparisons'
              }
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(item => (
                <div
                  key={item.ingredient_id}
                  className="bg-white rounded-lg shadow-sm border overflow-hidden"
                >
                  {/* Header Row — Click to Expand */}
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpanded(expanded === item.ingredient_id ? null : item.ingredient_id)}
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{item.ingredient_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.suppliers.length} supplier{item.suppliers.length !== 1 ? 's' : ''}
                        {' · '}Current: ${item.current_cost.toFixed(2)}/{item.unit}
                        {item.current_supplier && <span> · From: {item.current_supplier}</span>}
                      </p>
                    </div>

                    {/* Cheapest badge */}
                    {item.suppliers.length > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Cheapest</p>
                        <p className="text-lg font-bold text-green-700">
                          ${item.suppliers[0].last_price.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400">/{item.unit}</span>
                        </p>
                        <p className="text-xs text-green-600">{item.suppliers[0].supplier_name}</p>
                      </div>
                    )}

                    {/* Most expensive badge */}
                    {item.suppliers.length > 1 && (
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Most Expensive</p>
                        <p className="text-lg font-bold text-red-600">
                          ${item.suppliers[item.suppliers.length - 1].last_price.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400">/{item.unit}</span>
                        </p>
                        <p className="text-xs text-red-500">{item.suppliers[item.suppliers.length - 1].supplier_name}</p>
                      </div>
                    )}

                    <span className="text-gray-300 text-lg">
                      {expanded === item.ingredient_id ? '▼' : '▶'}
                    </span>
                  </div>

                  {/* Expanded Detail */}
                  {expanded === item.ingredient_id && (
                    <div className="border-t px-5 py-4 bg-gray-50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-2">Supplier</th>
                            <th className="text-right py-2">Last Price</th>
                            <th className="text-right py-2">Avg Price</th>
                            <th className="text-right py-2">Low</th>
                            <th className="text-right py-2">High</th>
                            <th className="text-center py-2">Purchases</th>
                            <th className="text-right py-2">Last Order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {item.suppliers.map((s, i) => (
                            <tr key={s.supplier_name + i} className={s.is_cheapest ? 'bg-green-50' : ''}>
                              <td className="py-2.5 font-medium flex items-center gap-1.5">
                                {s.is_cheapest && <CheckCircle className="h-4 w-4 text-green-600" />}
                                {s.supplier_name}
                                {s.is_cheapest && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-semibold">
                                    CHEAPEST
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-right font-mono font-semibold">
                                ${s.last_price.toFixed(2)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-gray-600">
                                ${s.avg_price.toFixed(2)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-green-600">
                                ${s.min_price.toFixed(2)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-red-500">
                                ${s.max_price.toFixed(2)}
                              </td>
                              <td className="py-2.5 text-center text-gray-500">
                                {s.purchase_count}
                              </td>
                              <td className="py-2.5 text-right text-gray-500">
                                {formatDate(s.last_purchase_date)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Price spread info */}
                      {item.suppliers.length > 1 && (() => {
                        const cheapest  = item.suppliers[0].last_price
                        const expensive = item.suppliers[item.suppliers.length - 1].last_price
                        const spread    = expensive - cheapest
                        const pct       = cheapest > 0 ? ((spread / cheapest) * 100).toFixed(1) : '0'
                        return (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-center gap-2">
                            {spread > 0 ? (
                              <TrendingDown className="h-4 w-4 text-amber-600 shrink-0" />
                            ) : (
                              <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                            )}
                            <span>
                              Price spread: <strong>${spread.toFixed(2)}/{item.unit}</strong> ({pct}% difference)
                              {spread > 0 && (
                                <> — buying from <strong>{item.suppliers[0].supplier_name}</strong> saves ${spread.toFixed(2)}/{item.unit}</>
                              )}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}