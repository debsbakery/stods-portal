'use client'

import { useState, useEffect } from 'react'
import { Plus, Printer, Save, Trash2, CheckCircle, Edit, AlertTriangle } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
  current_stock: number   // ✅ Added
}

interface StockTake {
  id: string
  take_date: string
  notes: string | null
  status: string
  created_at: string
  completed_at: string | null
}

interface Props {
  ingredients: Ingredient[]
  initialStockTakes: StockTake[]
}

interface CountEntry {
  packs: string
  pack_size_kg: string
}

export default function StockTakeView({ ingredients, initialStockTakes }: Props) {
  const [mounted, setMounted]       = useState(false)
  const [stockTakes, setStockTakes] = useState<StockTake[]>(initialStockTakes)
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [counts, setCounts]         = useState<Record<string, CountEntry>>({})
  const [takeDate, setTakeDate]     = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  useEffect(() => {
    setMounted(true)
    setTakeDate(new Date().toISOString().split('T')[0])
  }, [])

  // ... all your helper functions stay the same ...

  // Add this right before the main return:
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  // ... existing return JSX stays exactly the same ...
  // ── helpers ──────────────────────────────────────────────────────────────

  function getPhysicalKg(ingId: string) {
    const entry = counts[ingId]
    const packs   = entry?.packs        ? Number(entry.packs)        : 0
    const pkgSize = entry?.pack_size_kg ? Number(entry.pack_size_kg) : 0
    return packs * pkgSize
  }

  function getSystemKg(ing: Ingredient) {
    return ing.current_stock || 0
  }

  function getVariance(ing: Ingredient) {
    const entry = counts[ing.id]
    if (!entry?.packs || !entry?.pack_size_kg) return null
    return getPhysicalKg(ing.id) - getSystemKg(ing)
  }

  // ── KPI totals ────────────────────────────────────────────────────────────

  const totalPhysicalKg = ingredients.reduce((sum, ing) => sum + getPhysicalKg(ing.id), 0)

  const totalValue = ingredients.reduce((sum, ing) => {
    return sum + getPhysicalKg(ing.id) * Number(ing.unit_cost)
  }, 0)

  const totalVarianceKg = ingredients.reduce((sum, ing) => {
    const v = getVariance(ing)
    return sum + (v !== null ? Math.abs(v) : 0)
  }, 0)

  const itemsWithVariance = ingredients.filter(ing => {
    const v = getVariance(ing)
    return v !== null && Math.abs(v) > 0.001
  }).length

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleCreateNew() {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          take_date: takeDate,
          notes:     notes || null,
          items: ingredients.map((ing) => ({
            ingredient_id: ing.id,
            counted_packs: null,
            pack_size_kg:  null,
            total_kg:      null,
            notes:         null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setSuccess('Stock take created — enter pack counts below')
      setActiveId(json.data.id)
      setCounts({})
      setNotes('')

      const refreshRes  = await fetch('/api/admin/stock-takes')
      const refreshJson = await refreshRes.json()
      if (refreshJson.data) setStockTakes(refreshJson.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCounts() {
    if (!activeId) return
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const items = ingredients.map((ing) => {
        const entry   = counts[ing.id]
        const packs   = entry?.packs        ? Number(entry.packs)        : 0
        const pkgSize = entry?.pack_size_kg ? Number(entry.pack_size_kg) : 0
        const totalKg = packs * pkgSize
        return {
          ingredient_id: ing.id,
          counted_packs: packs   > 0 ? packs   : null,
          pack_size_kg:  pkgSize > 0 ? pkgSize : null,
          total_kg:      totalKg > 0 ? totalKg : null,
          notes:         null,
        }
      })

      const res = await fetch('/api/admin/stock-takes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId, items, status: 'completed' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const adjCount = json.adjustments_created ?? 0
      setSuccess(
        `✅ Stock take complete! ${adjCount} stock adjustment${adjCount !== 1 ? 's' : ''} created and inventory updated.`
      )
      setActiveId(null)
      setCounts({})

      const refreshRes  = await fetch('/api/admin/stock-takes')
      const refreshJson = await refreshRes.json()
      if (refreshJson.data) setStockTakes(refreshJson.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this stock take?')) return
    try {
      const res = await fetch('/api/admin/stock-takes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setStockTakes((prev) => prev.filter((st) => st.id !== id))
      if (activeId === id) { setActiveId(null); setCounts({}) }
    } catch (err: any) {
      setError(err.message)
    }
  }

  function updateCount(ingId: string, field: 'packs' | 'pack_size_kg', value: string) {
    setCounts(prev => ({
      ...prev,
      [ingId]: {
        packs:        field === 'packs'        ? value : (prev[ingId]?.packs        ?? ''),
        pack_size_kg: field === 'pack_size_kg' ? value : (prev[ingId]?.pack_size_kg ?? ''),
      },
    }))
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold">{success}</div>
      )}

      {/* ── Create New ── */}
      {!activeId && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-bold text-gray-800">Start New Stock Take</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Stock Take Date</label>
              <input
                type="date"
                value={takeDate}
                onChange={(e) => setTakeDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. End of month stock take"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <button
            onClick={handleCreateNew}
            disabled={saving}
            className="w-full py-3 rounded-lg text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: '#006A4E' }}
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Creating...' : 'Create Stock Take Sheet'}
          </button>
        </div>
      )}

      {/* ── Active Entry ── */}
      {activeId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden print-area">

          {/* Toolbar */}
          <div className="px-6 py-4 bg-green-50 border-b border-green-200 flex items-center justify-between no-print">
            <div>
              <h2 className="font-bold text-green-900">Active Stock Take — {takeDate}</h2>
              <p className="text-xs text-green-700 mt-0.5">
                Count packs and enter pack size. Completing will auto-update inventory.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5 text-sm font-semibold"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button
                onClick={handleSaveCounts}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                style={{ backgroundColor: '#006A4E' }}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save & Complete'}
              </button>
            </div>
          </div>

          {/* KPI bar */}
          <div className="grid grid-cols-4 divide-x divide-gray-200 border-b border-gray-200 no-print">
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500">Physical Stock</p>
              <p className="font-bold text-gray-800 text-lg">{totalPhysicalKg.toFixed(2)} kg</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500">Stock Value</p>
              <p className="font-bold text-gray-800 text-lg">${totalValue.toFixed(2)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500">Total Variance</p>
              <p className="font-bold text-amber-600 text-lg">{totalVarianceKg.toFixed(2)} kg</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500">Items with Variance</p>
              <p className={`font-bold text-lg ${itemsWithVariance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {itemsWithVariance}
              </p>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Ingredient</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">System Stock</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Unit Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase no-print">Packs</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase no-print">Pack Size (kg)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Physical (kg)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase no-print">Variance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase no-print">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ingredients.map((ing) => {
                const physicalKg  = getPhysicalKg(ing.id)
                const systemKg    = getSystemKg(ing)
                const variance    = getVariance(ing)
                const hasVariance = variance !== null && Math.abs(variance) > 0.001
                const value       = physicalKg * Number(ing.unit_cost)

                return (
                  <tr key={ing.id} className={`hover:bg-gray-50 ${hasVariance ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{ing.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 text-xs">
                      {systemKg.toFixed(2)} {ing.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      ${Number(ing.unit_cost).toFixed(4)}/{ing.unit}
                    </td>
                    <td className="px-4 py-3 no-print">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={counts[ing.id]?.packs ?? ''}
                        onChange={(e) => updateCount(ing.id, 'packs', e.target.value)}
                        placeholder="0"
                        className="w-full text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="px-4 py-3 no-print">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={counts[ing.id]?.pack_size_kg ?? ''}
                        onChange={(e) => updateCount(ing.id, 'pack_size_kg', e.target.value)}
                        placeholder="0.00"
                        className="w-full text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {physicalKg > 0 ? physicalKg.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right no-print">
                      {hasVariance && (
                        <span className={`font-mono font-bold flex items-center justify-end gap-1 ${
                          variance! > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {variance! > 0 ? '+' : ''}{variance!.toFixed(2)}
                          {Math.abs(variance!) > 1 && <AlertTriangle className="w-3 h-3" />}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 no-print">
                      {value > 0 ? '$' + value.toFixed(2) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 font-bold text-gray-800">Total</td>
                <td className="px-4 py-3 text-right font-bold font-mono">{totalPhysicalKg.toFixed(2)} kg</td>
                <td className="px-4 py-3 text-right font-bold font-mono text-amber-600 no-print">
                  {totalVarianceKg > 0 ? `±${totalVarianceKg.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 no-print">${totalValue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── History ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-bold text-gray-800">Stock Take History</h2>
        </div>
        {stockTakes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No stock takes recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Notes</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Completed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stockTakes.map((st) => (
                <tr key={st.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{st.take_date}</td>
                  <td className="px-4 py-3 text-gray-600">{st.notes ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {st.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" /> Complete
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {st.completed_at ? new Date(st.completed_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right flex gap-2 justify-end">
                    {st.status === 'draft' && (
                      <button
                        onClick={async () => {
                          setActiveId(st.id)
                          const res  = await fetch(`/api/admin/stock-takes?id=${st.id}`)
                          const data = await res.json()
                          if (data.data?.items) {
                            const newCounts: Record<string, CountEntry> = {}
                            data.data.items.forEach((item: any) => {
                              newCounts[item.ingredient_id] = {
                                packs:        item.counted_packs?.toString() || '',
                                pack_size_kg: item.pack_size_kg?.toString()  || '',
                              }
                            })
                            setCounts(newCounts)
                          }
                        }}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(st.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
