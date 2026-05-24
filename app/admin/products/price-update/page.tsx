'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, DollarSign, Percent, Hash,
  Check, X, AlertTriangle, RefreshCw, ChevronDown,
} from 'lucide-react'

type Product = {
  id: string
  name: string
  price: number
  category: string | null
  product_code: string | null
  active: boolean
}

type PriceUpdate = {
  product_id: string
  product_name: string
  old_price: number
  new_price: number
  change_type: string
  change_value: number
  selected: boolean
}

export default function PriceUpdatePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [method, setMethod] = useState<'percent' | 'flat' | 'set'>('percent')
  const [value, setValue] = useState<string>('')
  const [updates, setUpdates] = useState<PriceUpdate[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Fetch products
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/products/list')
        const data = await res.json()
        setProducts(
          (data.products || data || [])
            .filter((p: Product) => p.active !== false)
            .sort((a: Product, b: Product) => a.name.localeCompare(b.name))
        )
      } catch {
        // fallback: try direct supabase fetch via different endpoint
        setProducts([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>()
    products.forEach(p => {
      if (p.category) cats.add(p.category)
    })
    return ['all', ...Array.from(cats).sort()]
  }, [products])

  // Filtered products
  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.product_code || '').toLowerCase().includes(search.toLowerCase())
      const matchCategory =
        categoryFilter === 'all' || p.category === categoryFilter
      return matchSearch && matchCategory
    })
  }, [products, search, categoryFilter])

  // Select all / none
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(p => p.id)))
  }

  function selectNone() {
    setSelectedIds(new Set())
  }

  // Calculate preview
  function calculatePreview() {
    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue === 0) {
      alert('Please enter a valid value')
      return
    }

    const selected = filtered.filter(p => selectedIds.has(p.id))
    if (selected.length === 0) {
      alert('Please select at least one product')
      return
    }

    const previews: PriceUpdate[] = selected.map(p => {
      let newPrice: number

      switch (method) {
        case 'percent':
          newPrice = p.price * (1 + numValue / 100)
          break
        case 'flat':
          newPrice = p.price + numValue
          break
        case 'set':
          newPrice = numValue
          break
        default:
          newPrice = p.price
      }

      // Round to 2 decimal places
      newPrice = Math.round(newPrice * 100) / 100

      return {
        product_id: p.id,
        product_name: p.name,
        old_price: p.price,
        new_price: newPrice,
        change_type: method,
        change_value: numValue,
        selected: true,
      }
    })

    setUpdates(previews)
    setShowPreview(true)
    setResult(null)
  }

  // Remove single item from preview
  function removeFromPreview(productId: string) {
    setUpdates(prev => prev.filter(u => u.product_id !== productId))
  }

  // Apply updates
  async function applyUpdates() {
    const toApply = updates.filter(u => u.selected)
    if (toApply.length === 0) return

    const confirmMsg = `Update prices for ${toApply.length} product${toApply.length > 1 ? 's' : ''}?\n\nThis cannot be undone.`
    if (!confirm(confirmMsg)) return

    setApplying(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/products/bulk-price-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: toApply }),
      })
      const data = await res.json()

      if (data.success) {
        setResult({
          success: true,
          message: `✅ Updated ${data.updated} product${data.updated > 1 ? 's' : ''} successfully.${
            data.errors?.length > 0
              ? ` ${data.errors.length} error(s): ${data.errors.join(', ')}`
              : ''
          }`,
        })
        // Refresh products list
        const refreshRes = await fetch('/api/admin/products/list')
        const refreshData = await refreshRes.json()
        setProducts(
          (refreshData.products || refreshData || [])
            .filter((p: Product) => p.active !== false)
            .sort((a: Product, b: Product) => a.name.localeCompare(b.name))
        )
        setShowPreview(false)
        setUpdates([])
        setSelectedIds(new Set())
        setValue('')
      } else {
        setResult({
          success: false,
          message: `❌ ${data.error || 'Update failed'}`,
        })
      }
    } catch (err: any) {
      setResult({ success: false, message: `❌ ${err.message}` })
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <a
            href="/admin"
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Price Rise Tool
            </h1>
            <p className="text-sm text-gray-500">
              Bulk update product prices by percentage, flat amount, or set
              price
            </p>
          </div>
        </div>

        {/* Result banner */}
        {result && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              result.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <p className="font-medium">{result.message}</p>
          </div>
        )}

        {!showPreview ? (
          <>
            {/* Controls */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">
                1. Select Products
              </h2>

              <div className="flex flex-wrap gap-3 mb-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Category filter */}
                <div className="relative">
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c === 'all' ? 'All Categories' : c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Select all / none */}
                <button
                  onClick={selectAll}
                  className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100"
                >
                  Select All ({filtered.length})
                </button>
                <button
                  onClick={selectNone}
                  className="px-4 py-2 bg-gray-50 text-gray-600 border rounded-lg text-sm font-medium hover:bg-gray-100"
                >
                  Clear
                </button>
              </div>

              {/* Selected count */}
              <p className="text-sm text-gray-500 mb-3">
                <span className="font-semibold text-blue-600">
                  {selectedIds.size}
                </span>{' '}
                of {filtered.length} products selected
              </p>

              {/* Product list */}
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={
                            filtered.length > 0 &&
                            filtered.every(p => selectedIds.has(p.id))
                          }
                          onChange={e =>
                            e.target.checked ? selectAll() : selectNone()
                          }
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">
                        Product
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">
                        Code
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">
                        Category
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">
                        Current Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(p => (
                      <tr
                        key={p.id}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedIds.has(p.id) ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleSelect(p.id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {p.product_code || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {p.category || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ${p.price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-gray-400"
                        >
                          No products found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Method + Value */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">
                2. Set Price Change
              </h2>

              <div className="flex flex-wrap gap-3 mb-4">
                <button
                  onClick={() => setMethod('percent')}
                  className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    method === 'percent'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Percent className="h-4 w-4" />
                  Percentage
                </button>
                <button
                  onClick={() => setMethod('flat')}
                  className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    method === 'flat'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  Flat Amount
                </button>
                <button
                  onClick={() => setMethod('set')}
                  className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    method === 'set'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Hash className="h-4 w-4" />
                  Set Price
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  {method === 'percent' ? (
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  ) : (
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  )}
                  <input
                    type="number"
                    step="0.01"
                    placeholder={
                      method === 'percent'
                        ? 'e.g. 5 for 5%'
                        : method === 'flat'
                          ? 'e.g. 0.50'
                          : 'e.g. 12.00'
                    }
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className={`w-48 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      method === 'percent' ? 'pl-4 pr-10' : 'pl-10 pr-4'
                    }`}
                  />
                </div>

                <p className="text-sm text-gray-500">
                  {method === 'percent' && 'Increase all selected by this %'}
                  {method === 'flat' && 'Add this $ amount to all selected'}
                  {method === 'set' && 'Set all selected to this exact price'}
                </p>
              </div>

              {method === 'percent' && value && !isNaN(parseFloat(value)) && (
                <p className="mt-3 text-sm text-gray-500">
                  Example: $10.00 →{' '}
                  <span className="font-semibold text-gray-900">
                    $
                    {(10 * (1 + parseFloat(value) / 100)).toFixed(2)}
                  </span>
                </p>
              )}
            </div>

            {/* Preview button */}
            <div className="flex justify-end">
              <button
                onClick={calculatePreview}
                disabled={selectedIds.size === 0 || !value}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                Preview Changes →
              </button>
            </div>
          </>
        ) : (
          /* Preview Screen */
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                3. Review & Apply ({updates.length} product
                {updates.length !== 1 ? 's' : ''})
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Selection
              </button>
            </div>

            {/* Summary */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <span className="font-medium">Method:</span>{' '}
              {method === 'percent' && `+${value}%`}
              {method === 'flat' && `+$${parseFloat(value).toFixed(2)}`}
              {method === 'set' && `Set to $${parseFloat(value).toFixed(2)}`}
              {' · '}
              <span className="font-medium">{updates.length}</span> products
            </div>

            {/* Preview table */}
            <div className="border rounded-lg max-h-[500px] overflow-y-auto mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                      Product
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                      Current
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700">
                      →
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                      New Price
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                      Change
                    </th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {updates.map(u => {
                    const diff = u.new_price - u.old_price
                    const pctChange =
                      u.old_price > 0
                        ? ((diff / u.old_price) * 100).toFixed(1)
                        : '—'
                    const isLarge = Math.abs(diff / u.old_price) > 0.1

                    return (
                      <tr key={u.product_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">
                          {u.product_name}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">
                          ${u.old_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400">
                          →
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">
                          ${u.new_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              isLarge
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {isLarge && (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            +${diff.toFixed(2)} ({pctChange}%)
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeFromPreview(u.product_id)}
                            className="text-gray-300 hover:text-red-500"
                            title="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Warning for large changes */}
            {updates.some(
              u => Math.abs((u.new_price - u.old_price) / u.old_price) > 0.1
            ) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  Some products have changes over 10%. Double-check before
                  applying.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-3 border rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={applyUpdates}
                disabled={applying || updates.length === 0}
                className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 shadow-md"
              >
                {applying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Applying...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Apply {updates.length} Price
                    Change{updates.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}