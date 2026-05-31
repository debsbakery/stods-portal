'use client'

import { useState } from 'react'
import { Plus, Trash2, TrendingUp, Package, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
  supplier: string | null
}

interface Receipt {
  id: string
  ingredient_id: string
  supplier: string | null
  quantity_kg: number
  unit_cost: number
  total_cost: number
  invoice_ref: string | null
  received_date: string
  notes: string | null
  created_at: string
  ingredients: { id: string; name: string; unit: string } | null
}

interface Props {
  ingredients: Ingredient[]
  initialReceipts: Receipt[]
}

interface InvoiceLine {
  ingredient_id: string
  packs: string
  pack_size_kg: string
  price_per_pack: string
  update_cost: boolean
}

const EMPTY_LINE: InvoiceLine = {
  ingredient_id: '',
  packs: '',
  pack_size_kg: '',
  price_per_pack: '',
  update_cost: true,
}

export default function InventoryReceivedView({ ingredients, initialReceipts }: Props) {
  const [receipts, setReceipts]   = useState<Receipt[]>(initialReceipts)
  const [lines, setLines]         = useState<InvoiceLine[]>([{ ...EMPTY_LINE }])
  const [supplier, setSupplier]   = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showForm, setShowForm]   = useState(true)
  const [filterIng, setFilterIng] = useState('')

  function addLine() {
    setLines(prev => [...prev, { ...EMPTY_LINE }])
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: keyof InvoiceLine, value: any) {
    setLines(prev => prev.map((line, i) => {
      if (i !== idx) return line
      const updated = { ...line, [field]: value }
      // Auto-fill supplier from ingredient if not set
      if (field === 'ingredient_id' && !supplier) {
        const ing = ingredients.find(i => i.id === value)
        if (ing?.supplier) setSupplier(ing.supplier)
      }
      return updated
    }))
  }

  function calcLine(line: InvoiceLine) {
    const packs = Number(line.packs) || 0
    const packSizeKg = Number(line.pack_size_kg) || 0
    const pricePerPack = Number(line.price_per_pack) || 0
    const totalKg = packs * packSizeKg
    const totalCost = packs * pricePerPack
    const unitCost = totalKg > 0 ? totalCost / totalKg : 0
    return { packs, packSizeKg, pricePerPack, totalKg, totalCost, unitCost }
  }

  const invoiceTotalCost = lines.reduce((sum, line) => sum + calcLine(line).totalCost, 0)
  const invoiceTotalKg   = lines.reduce((sum, line) => sum + calcLine(line).totalKg, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validLines = lines.filter(line => {
      const { totalKg, unitCost } = calcLine(line)
      return line.ingredient_id && totalKg > 0 && unitCost > 0
    })

    if (validLines.length === 0) {
      setError('Add at least one valid ingredient line')
      return
    }

    setSaving(true)

    try {
      const results: string[] = []

      for (const line of validLines) {
        const { totalKg, totalCost, unitCost } = calcLine(line)
        const ing = ingredients.find(i => i.id === line.ingredient_id)

        const res = await fetch('/api/admin/ingredient-receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_id: line.ingredient_id,
            supplier:      supplier || null,
            quantity_kg:   totalKg,
            unit_cost:     unitCost,
            total_cost:    totalCost,
            invoice_ref:   invoiceRef || null,
            received_date: receivedDate,
            notes:         notes || null,
            update_cost:   line.update_cost,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(`${ing?.name}: ${json.error}`)

        results.push(`${ing?.name} ${totalKg.toFixed(1)}kg`)
      }

      setSuccess(`✅ Received: ${results.join(', ')}`)
      setLines([{ ...EMPTY_LINE }])
      setSupplier('')
      setInvoiceRef('')
      setNotes('')

      const refreshRes = await fetch('/api/admin/ingredient-receipts')
      const refreshJson = await refreshRes.json()
      if (refreshJson.data) setReceipts(refreshJson.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this receipt record?')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/admin/ingredient-receipts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setReceipts(prev => prev.filter(r => r.id !== id))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const filteredReceipts = filterIng
    ? receipts.filter(r => r.ingredient_id === filterIng)
    : receipts

  const totalSpend = filteredReceipts.reduce((s, r) => s + Number(r.total_cost ?? 0), 0)
  const totalKgAll = filteredReceipts.reduce((s, r) => s + Number(r.quantity_kg ?? 0), 0)

  return (
    <div className="space-y-6">

      {/* Record Delivery Form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-green-700" />
            <span className="font-bold text-gray-800">Record Delivery (Invoice Format)</span>
          </div>
          {showForm ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold">{success}</div>
            )}

            {/* Invoice Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="e.g. Allied Mills"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Ref</label>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={e => setInvoiceRef(e.target.value)}
                  placeholder="INV-12345"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Received Date</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={e => setReceivedDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase px-1">
                <div className="col-span-3">Ingredient</div>
                <div className="col-span-2">Packs</div>
                <div className="col-span-2">Pack Size (kg)</div>
                <div className="col-span-2">$/Pack</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-1"></div>
              </div>

              {lines.map((line, idx) => {
                const { totalKg, totalCost, unitCost } = calcLine(line)
                const ing = ingredients.find(i => i.id === line.ingredient_id)
                const prevCost = ing ? Number(ing.unit_cost) : null
                const costChanged = prevCost !== null && unitCost > 0 && prevCost !== unitCost
                const costDiff = costChanged ? (((unitCost - prevCost) / prevCost) * 100).toFixed(1) : null

                return (
                  <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-3">
                        <select
                          value={line.ingredient_id}
                          onChange={e => updateLine(idx, 'ingredient_id', e.target.value)}
                          className="w-full border border-blue-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">— Select —</option>
                          {ingredients.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.packs}
                          onChange={e => updateLine(idx, 'packs', e.target.value)}
                          placeholder="e.g. 42"
                          className="w-full border border-blue-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.pack_size_kg}
                          onChange={e => updateLine(idx, 'pack_size_kg', e.target.value)}
                          placeholder="e.g. 25"
                          className="w-full border border-blue-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.price_per_pack}
                          onChange={e => updateLine(idx, 'price_per_pack', e.target.value)}
                          placeholder="e.g. 25.00"
                          className="w-full border border-blue-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2 py-2">
                        {totalKg > 0 ? (
                          <div>
                            <p className="text-xs font-bold text-blue-900">{totalKg.toFixed(1)}kg</p>
                            <p className="text-xs text-blue-700">${totalCost.toFixed(2)}</p>
                            <p className="text-xs text-blue-500">${unitCost.toFixed(4)}/kg</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">—</p>
                        )}
                      </div>
                      <div className="col-span-1 flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length === 1}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Cost change warning + update toggle */}
                    <div className="flex items-center gap-4 pl-1">
                      <label className="flex items-center gap-2 text-xs text-blue-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.update_cost}
                          onChange={e => updateLine(idx, 'update_cost', e.target.checked)}
                          className="rounded accent-green-600"
                        />
                        Update ingredient price
                      </label>
                      {costChanged && costDiff && (
                        <span className={`text-xs font-bold ${Number(costDiff) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {Number(costDiff) > 0 ? '▲' : '▼'} {Math.abs(Number(costDiff))}% from ${prevCost!.toFixed(4)}/kg
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="h-4 w-4" /> Add another ingredient
            </button>

            {/* Invoice Total */}
            {lines.length > 1 && invoiceTotalCost > 0 && (
              <div className="p-3 bg-gray-100 rounded-lg flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">Invoice Total</span>
                <div className="text-right">
                  <p className="font-bold text-gray-900">${invoiceTotalCost.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">{invoiceTotalKg.toFixed(1)} kg total</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-lg text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#2c2c2c' }}
            >
              {saving ? 'Saving...' : `Record Delivery${lines.filter(l => l.ingredient_id).length > 1 ? ` (${lines.filter(l => l.ingredient_id).length} ingredients)` : ''}`}
            </button>

          </form>
        )}
      </div>

      {/* Receipt History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-800">Delivery History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 100 receipts</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterIng}
              onChange={e => setFilterIng(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All ingredients</option>
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200">
          <div className="px-5 py-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Total Received</p>
              <p className="font-bold text-gray-800">{totalKgAll.toFixed(1)} kg</p>
            </div>
          </div>
          <div className="px-5 py-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Total Spend</p>
              <p className="font-bold text-gray-800">${totalSpend.toFixed(2)}</p>
            </div>
          </div>
          <div className="px-5 py-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Avg Cost/kg</p>
              <p className="font-bold text-gray-800">
                {totalKgAll > 0 ? '$' + (totalSpend / totalKgAll).toFixed(4) : '—'}
              </p>
            </div>
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No delivery records yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Ingredient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Ref</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Qty (kg)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Unit Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReceipts.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.received_date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.ingredients?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.supplier ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.invoice_ref ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(r.quantity_kg).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${Number(r.unit_cost).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">${Number(r.total_cost).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}