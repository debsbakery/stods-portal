'use client'

import { useState, useEffect } from 'react'
import {
  Search, Loader2, AlertTriangle, Package, Plus,
  Minus, ClipboardCheck, Trash2, X, Save, RotateCcw,
  Calendar, TrendingDown,
} from 'lucide-react'

interface Usage {
  kg_used_last_7_days: number
  kg_used_last_30_days: number
  kg_used_last_90_days: number
  daily_avg: number
  weekly_avg: number
  days_remaining: number | null
  weeks_remaining: number | null
  reorder_date: string | null
}

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
  current_stock: number | null
  reorder_point: number | null
  supplier_id: string | null
  suppliers: { id: string; name: string } | null
  usage: Usage | null
}

interface Adjustment {
  id: string
  ingredient_id: string
  adjustment_type: string
  quantity: number
  unit: string
  reason: string | null
  created_at: string
  ingredients: { name: string } | null
}

const ADJ_TYPES = [
  { value: 'receive',   label: '📦 Receive' },
  { value: 'waste',     label: '🗑️ Waste' },
  { value: 'usage',     label: '🍞 Usage' },
  { value: 'stocktake', label: '📋 Stocktake' },
  { value: 'return',    label: '↩️ Return' },
]

function formatDate(d: string) {
  const date = new Date(d)
  return [
    date.getDate().toString().padStart(2, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getFullYear(),
  ].join('/')
}

function getStockStatus(i: Ingredient): { label: string; color: string; bg: string } {
  const days = i.usage?.days_remaining
  const stock = i.current_stock ?? 0
  const reorder = i.reorder_point ?? 0

  if (stock <= 0 && i.usage?.daily_avg && i.usage.daily_avg > 0) {
    return { label: 'OUT', color: 'text-white', bg: 'bg-red-600' }
  }
  if (days !== null && days <= 3) {
    return { label: `${days}d left`, color: 'text-red-700', bg: 'bg-red-100' }
  }
  if (days !== null && days <= 7) {
    return { label: `${days}d left`, color: 'text-orange-700', bg: 'bg-orange-100' }
  }
  if (days !== null && days <= 14) {
    return { label: `${days}d left`, color: 'text-amber-700', bg: 'bg-amber-100' }
  }
  if (days !== null && days <= 21) {
    return { label: `~${i.usage?.weeks_remaining}w`, color: 'text-blue-700', bg: 'bg-blue-100' }
  }
  if (reorder > 0 && stock <= reorder) {
    return { label: 'LOW', color: 'text-red-700', bg: 'bg-red-100' }
  }
  if (days !== null) {
    return { label: `~${i.usage?.weeks_remaining}w`, color: 'text-green-700', bg: 'bg-green-100' }
  }
  if (stock > 0) {
    return { label: 'OK', color: 'text-green-700', bg: 'bg-green-100' }
  }
  return { label: '—', color: 'text-gray-400', bg: 'bg-gray-100' }
}

export default function StockView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [lowStock, setLowStock]       = useState<Ingredient[]>([])
  const [history, setHistory]         = useState<Adjustment[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showAdj, setShowAdj]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [message, setMessage]         = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filter, setFilter]           = useState<'all' | 'low' | 'used'>('all')
  const [editReorder, setEditReorder] = useState<string | null>(null)
  const [reorderVal, setReorderVal]   = useState('')
  const [sortBy, setSortBy]           = useState<'name' | 'days' | 'usage'>('name')

  const [adjForm, setAdjForm] = useState({
    ingredient_id:   '',
    adjustment_type: 'receive',
    quantity:        '',
    reason:          '',
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [stockRes, histRes] = await Promise.all([
        fetch('/api/admin/stock'),
        fetch('/api/admin/stock/history'),
      ])
      const stockData = await stockRes.json()
      const histData  = await histRes.json()
      setIngredients(stockData.ingredients ?? [])
      setLowStock(stockData.low_stock ?? [])
      setHistory(histData ?? [])
    } finally {
      setLoading(false)
    }
  }

  const filtered = ingredients.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
    if (filter === 'low') {
      const days = i.usage?.days_remaining
      return matchSearch && ((days !== null && days <= 7) || ((i.reorder_point || 0) > 0 && (i.current_stock || 0) <= (i.reorder_point || 0)))
    }
    if (filter === 'used') {
      return matchSearch && i.usage && i.usage.kg_used_last_30_days > 0
    }
    return matchSearch
  }).sort((a, b) => {
    if (sortBy === 'days') {
      const aDays = a.usage?.days_remaining ?? 999
      const bDays = b.usage?.days_remaining ?? 999
      return aDays - bDays
    }
    if (sortBy === 'usage') {
      const aUse = a.usage?.weekly_avg ?? 0
      const bUse = b.usage?.weekly_avg ?? 0
      return bUse - aUse
    }
    return a.name.localeCompare(b.name)
  })

  async function handleAdjust() {
    if (!adjForm.ingredient_id || !adjForm.quantity || parseFloat(adjForm.quantity) === 0) {
      setMessage({ type: 'error', text: 'Select an ingredient and enter a quantity' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...adjForm,
          quantity: parseFloat(adjForm.quantity),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const ingName = ingredients.find(i => i.id === adjForm.ingredient_id)?.name || ''
      setMessage({ type: 'success', text: `${adjForm.adjustment_type} recorded for ${ingName} — new stock: ${data.new_stock}` })
      setShowAdj(false)
      setAdjForm({ ingredient_id: '', adjustment_type: 'receive', quantity: '', reason: '' })
      fetchData()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveReorder(ingredientId: string) {
    try {
      const res = await fetch('/api/admin/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: ingredientId,
          reorder_point: parseFloat(reorderVal) || 0,
        }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditReorder(null)
      fetchData()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-green-700" />
            Stock Levels
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {ingredients.length} ingredients · Usage based on last 30 days sales
          </p>
        </div>
        <button
          onClick={() => setShowAdj(true)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ backgroundColor: '#006A4E' }}
        >
          <Plus className="h-4 w-4" /> Stock Adjustment
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-green-700" />
        </div>
      ) : (
        <>
          {/* Low Stock Alert */}
          {lowStock.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold text-red-800">
                  {lowStock.length} ingredient{lowStock.length !== 1 ? 's' : ''} need attention
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {lowStock.map(i => {
                  const days = i.usage?.days_remaining
                  return (
                    <span key={i.id} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                      {i.name}: {i.current_stock ?? 0} {i.unit}
                      {days !== null && ` (~${days} days)`}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          {/* Filters + Sort */}
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
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Ingredients</option>
              <option value="used">With Usage Data</option>
              <option value="low">⚠️ Low Stock</option>
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="name">Sort: Name</option>
              <option value="days">Sort: Days Remaining</option>
              <option value="usage">Sort: Highest Usage</option>
            </select>
          </div>

          {/* Stock Table */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">In Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Weekly Use</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Daily Avg</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Stock Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Reorder By</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Reorder Pt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        No ingredients match your filter
                      </td>
                    </tr>
                  ) : (
                    filtered.map(i => {
                      const stock  = i.current_stock ?? 0
                      const status = getStockStatus(i)

                      return (
                        <tr key={i.id} className={`hover:bg-gray-50 ${
                          status.label === 'OUT' ? 'bg-red-50' :
                          status.label.includes('d left') && (i.usage?.days_remaining ?? 99) <= 7 ? 'bg-red-50' :
                          ''
                        }`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{i.name}</p>
                            <p className="text-xs text-gray-400">
                              {(i.suppliers as any)?.name || '—'}
                              {' · '}${Number(i.unit_cost).toFixed(2)}/{i.unit}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                            {stock > 0 ? `${stock} ${i.unit}` : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-600">
                            {i.usage?.weekly_avg
                              ? `${i.usage.weekly_avg} ${i.unit}`
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-600">
                            {i.usage?.daily_avg
                              ? `${i.usage.daily_avg} ${i.unit}`
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {i.usage?.reorder_date ? (
                              <span className="flex items-center justify-end gap-1 text-gray-600">
                                <Calendar className="h-3 w-3" />
                                {formatDate(i.usage.reorder_date)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {editReorder === i.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={reorderVal}
                                  onChange={e => setReorderVal(e.target.value)}
                                  className="w-20 px-2 py-1 text-sm border rounded text-right"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveReorder(i.id)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditReorder(null)}
                                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditReorder(i.id); setReorderVal(String(i.reorder_point ?? 0)) }}
                                className="text-gray-500 hover:text-blue-600 font-mono text-xs"
                                title="Click to edit reorder point"
                              >
                                {(i.reorder_point ?? 0) > 0 ? `${i.reorder_point} ${i.unit}` : 'Set'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Adjustments */}
          <h2 className="text-lg font-semibold mb-3">Recent Stock Adjustments</h2>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No stock adjustments recorded yet
                    </td>
                  </tr>
                ) : (
                  history.slice(0, 50).map(adj => (
                    <tr key={adj.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {formatDate(adj.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          adj.adjustment_type === 'receive' ? 'bg-green-100 text-green-700' :
                          adj.adjustment_type === 'waste'   ? 'bg-red-100 text-red-700' :
                          adj.adjustment_type === 'usage'   ? 'bg-orange-100 text-orange-700' :
                          adj.adjustment_type === 'return'  ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {ADJ_TYPES.find(t => t.value === adj.adjustment_type)?.label || adj.adjustment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {(adj.ingredients as any)?.name || '-'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${
                        adj.quantity > 0 ? 'text-green-700' : 'text-red-600'
                      }`}>
                        {adj.quantity > 0 ? '+' : ''}{adj.quantity} {adj.unit}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {adj.reason || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Adjustment Modal */}
          {showAdj && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b">
                  <h3 className="text-lg font-bold">Stock Adjustment</h3>
                  <button onClick={() => setShowAdj(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ingredient *</label>
                    <select
                      value={adjForm.ingredient_id}
                      onChange={e => setAdjForm({ ...adjForm, ingredient_id: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select ingredient</option>
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} (stock: {i.current_stock ?? 0} {i.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ADJ_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setAdjForm({ ...adjForm, adjustment_type: t.value })}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            adjForm.adjustment_type === t.value
                              ? 'bg-green-700 text-white border-green-700'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={adjForm.quantity}
                      onChange={e => setAdjForm({ ...adjForm, quantity: e.target.value })}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <input
                      type="text"
                      value={adjForm.reason}
                      onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })}
                      placeholder="Optional reason..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
                  <button
                    onClick={() => setShowAdj(false)}
                    className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdjust}
                    disabled={saving}
                    className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: '#006A4E' }}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Record Adjustment
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}