'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Truck, AlertTriangle, Search,
  Plus, Save, Loader2, X, Calendar,
} from 'lucide-react'

interface Usage {
  daily_avg: number
  weekly_avg: number
  days_remaining: number | null
  weeks_remaining: number | null
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

interface Receipt {
  id: string
  ingredient_id: string
  supplier_id: string | null
  supplier: string | null
  quantity_kg: number
  unit_cost: number
  total_cost: number
  invoice_ref: string | null
  received_date: string
  notes: string | null
  packs: number | null           // ✅ NEW
  pack_size_kg: number | null    // ✅ NEW
  cost_per_pack: number | null   // ✅ NEW
  ingredients: { id: string; name: string; unit: string } | null
  suppliers: { id: string; name: string } | null
}

interface Supplier {
  id: string
  name: string
}

interface Props {
  ingredients: Ingredient[]
  initialReceipts: Receipt[]
  suppliers: Supplier[]
}

function formatDate(d: string) {
  if (!d) return '-'
  const date = new Date(d + 'T00:00:00')
  return [
    date.getDate().toString().padStart(2, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getFullYear(),
  ].join('/')
}

export default function InventoryDashboard({ ingredients, initialReceipts, suppliers }: Props) {
  const router = useRouter()
  const [receipts, setReceipts] = useState(initialReceipts)
  const [tab, setTab]           = useState<'overview' | 'receive' | 'history'>('overview')
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ✅ UPDATED FORM STATE
  const [form, setForm] = useState({
    ingredient_id:  '',
    supplier_id:    '',
    packs:          '',      // ✅ NEW
    pack_size_kg:   '',      // ✅ NEW
    cost_per_pack:  '',      // ✅ NEW (what's on invoice)
    invoice_ref:    '',
    received_date:  new Date().toISOString().split('T')[0],
    notes:          '',
  })

  // Stats
  const lowStock = ingredients.filter(i => {
    const days = i.usage?.days_remaining
    if (days !== null && days !== undefined && days <= 7) return true
    if ((i.reorder_point || 0) > 0 && (i.current_stock || 0) <= (i.reorder_point || 0)) return true
    return false
  })

  const withUsage = ingredients.filter(i => i.usage && i.usage.weekly_avg > 0)
  const totalStockValue = ingredients.reduce((sum, i) =>
    sum + ((i.current_stock || 0) * (i.unit_cost || 0)), 0
  )

  // Filter for overview
  const filteredIngredients = ingredients.filter(i => {
    if (!search) return i.usage && i.usage.weekly_avg > 0
    return i.name.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => {
    const aDays = a.usage?.days_remaining ?? 999
    const bDays = b.usage?.days_remaining ?? 999
    return aDays - bDays
  })

  // ✅ UPDATED: Auto-fill when ingredient selected
  function handleIngredientChange(ingredientId: string) {
    const ing = ingredients.find(i => i.id === ingredientId)
    setForm({
      ...form,
      ingredient_id: ingredientId,
      supplier_id:   ing?.supplier_id || '',
      // Don't auto-fill costs - user enters from invoice
    })
  }

  // ✅ CALCULATED VALUES
  const totalKg = (parseFloat(form.packs || '0') * parseFloat(form.pack_size_kg || '0'))
  const costPerKg = form.pack_size_kg ? 
    (parseFloat(form.cost_per_pack || '0') / parseFloat(form.pack_size_kg)) : 0
  const totalCost = (parseFloat(form.packs || '0') * parseFloat(form.cost_per_pack || '0'))

  // ✅ UPDATED SUBMIT HANDLER
  async function handleReceive() {
    if (!form.ingredient_id || !form.packs || !form.pack_size_kg || !form.cost_per_pack) {
      setMessage({ type: 'error', text: 'Please fill in: Ingredient, Packs, Pack Size, and Cost per Pack' })
      return
    }
    
    if (totalKg <= 0) {
      setMessage({ type: 'error', text: 'Total kg must be greater than 0' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/inventory/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id:  form.ingredient_id,
          supplier_id:    form.supplier_id || null,
          packs:          parseFloat(form.packs),           // ✅ NEW
          pack_size_kg:   parseFloat(form.pack_size_kg),    // ✅ NEW
          cost_per_pack:  parseFloat(form.cost_per_pack),   // ✅ NEW
          quantity_kg:    totalKg,                          // Calculated
          unit_cost:      costPerKg,                        // Calculated $/kg
          total_cost:     totalCost,                        // Calculated
          invoice_ref:    form.invoice_ref || null,
          received_date:  form.received_date,
          notes:          form.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record')

      const ingName = ingredients.find(i => i.id === form.ingredient_id)?.name || ''
      setMessage({ 
        type: 'success', 
        text: `✅ Received ${form.packs} × ${form.pack_size_kg}kg ${ingName} (${totalKg.toFixed(2)}kg total) — stock updated` 
      })
      setShowForm(false)
      setForm({
        ingredient_id: '', supplier_id: '', packs: '', pack_size_kg: '', cost_per_pack: '',
        invoice_ref: '', received_date: new Date().toISOString().split('T')[0], notes: '',
      })
      router.refresh()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
          <p className="text-xs text-blue-500 mb-1">Tracked Ingredients</p>
          <p className="text-2xl font-bold text-blue-700">{withUsage.length}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
          <p className="text-xs text-green-500 mb-1">Stock Value</p>
          <p className="text-2xl font-bold text-green-700">${totalStockValue.toFixed(0)}</p>
        </div>
        <div className={`p-4 rounded-lg border text-center ${
          lowStock.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
        }`}>
          <p className="text-xs text-gray-500 mb-1">Low Stock Alerts</p>
          <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>
            {lowStock.length}
          </p>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 text-center">
          <p className="text-xs text-purple-500 mb-1">Deliveries This Month</p>
          <p className="text-2xl font-bold text-purple-700">
            {receipts.filter(r => {
              const d = new Date(r.received_date)
              const now = new Date()
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).length}
          </p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-800">Low Stock — Order Soon</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                {i.name}: {i.current_stock ?? 0} {i.unit}
                {i.usage?.days_remaining != null && ` (~${i.usage.days_remaining}d left)`}
              </span>
            ))}
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

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['overview', 'receive', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
            }`}
          >
            {t === 'overview' && '📊 Stock Overview'}
            {t === 'receive' && '📦 Receive Delivery'}
            {t === 'history' && '📋 Delivery History'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search ingredients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">In Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Weekly Use</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">$/Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIngredients.map(i => {
                  const stock = i.current_stock ?? 0
                  const days  = i.usage?.days_remaining
                  const isLow = days !== null && days !== undefined && days <= 7

                  return (
                    <tr key={i.id} className={`hover:bg-gray-50 ${isLow ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{i.name}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {stock > 0 ? `${stock} ${i.unit}` : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {i.usage?.weekly_avg ? `${i.usage.weekly_avg.toFixed(1)} ${i.unit}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {days !== null && days !== undefined ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            days <= 3 ? 'bg-red-600 text-white' :
                            days <= 7 ? 'bg-red-100 text-red-700' :
                            days <= 14 ? 'bg-orange-100 text-orange-700' :
                            days <= 21 ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {days <= 0 ? 'OUT' : `~${i.usage?.weeks_remaining}w`}
                          </span>
                        ) : stock > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        ${Number(i.unit_cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {(i.suppliers as any)?.name || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── RECEIVE TAB ── ✅ UPDATED */}
      {tab === 'receive' && (
        <div className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-green-700" />
            Record Delivery (Invoice Format)
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ingredient *</label>
              <select
                value={form.ingredient_id}
                onChange={e => handleIngredientChange(e.target.value)}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select
                value={form.supplier_id}
                onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* ✅ NEW: Invoice Format Inputs */}
            <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
              <p className="text-xs font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Enter from Invoice
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Packs *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={form.packs}
                    onChange={e => setForm({ ...form, packs: e.target.value })}
                    placeholder="10"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Pack Size (kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.pack_size_kg}
                    onChange={e => setForm({ ...form, pack_size_kg: e.target.value })}
                    placeholder="20"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cost per Pack *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.cost_per_pack}
                    onChange={e => setForm({ ...form, cost_per_pack: e.target.value })}
                    placeholder="35.00"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>

            {/* ✅ CALCULATIONS DISPLAY */}
            {form.packs && form.pack_size_kg && form.cost_per_pack && (
              <div className="grid grid-cols-3 gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-xs text-green-600 mb-1">Total Quantity</p>
                  <p className="text-lg font-bold text-green-800">{totalKg.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 mb-1">Cost per kg</p>
                  <p className="text-lg font-bold text-green-800">${costPerKg.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 mb-1">Total Cost</p>
                  <p className="text-lg font-bold text-green-800">${totalCost.toFixed(2)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Received Date</label>
                <input
                  type="date"
                  value={form.received_date}
                  onChange={e => setForm({ ...form, received_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Ref</label>
                <input
                  type="text"
                  value={form.invoice_ref}
                  onChange={e => setForm({ ...form, invoice_ref: e.target.value })}
                  placeholder="INV-12345"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <button
              onClick={handleReceive}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 text-white font-medium rounded-lg disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: '#006A4E' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Record Delivery
            </button>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── ✅ UPDATED TO SHOW PACK INFO */}
      {tab === 'history' && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Packs</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Pack Size</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total (kg)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">$/Pack</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Cost</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No deliveries recorded yet
                  </td>
                </tr>
              ) : (
                receipts.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.received_date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {(r.ingredients as any)?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {(r.suppliers as any)?.name || r.supplier || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.packs ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {r.pack_size_kg ? `${r.pack_size_kg}kg` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {r.quantity_kg.toFixed(2)} kg
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.cost_per_pack ? `$${Number(r.cost_per_pack).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                      ${Number(r.total_cost).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.invoice_ref || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}