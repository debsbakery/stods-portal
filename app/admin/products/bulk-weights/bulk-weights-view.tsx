'use client'

import { useState, useRef } from 'react'
import { ArrowLeft, Save, CheckCircle, AlertCircle } from 'lucide-react'

interface Product {
  id: string
  name: string
  code: string | null
  category: string | null
  price: number
  weight_grams: number | null
  labour_pct: number | null
}

export default function BulkWeightsView({ products }: { products: Product[] }) {
  const [weights, setWeights]   = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    products.forEach(p => { init[p.id] = p.weight_grams?.toString() ?? '' })
    return init
  })
  const [labours, setLabours]   = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    products.forEach(p => { init[p.id] = p.labour_pct?.toString() ?? '' })
    return init
  })
  const [saving,  setSaving]    = useState<Record<string, boolean>>({})
  const [saved,   setSaved]     = useState<Record<string, boolean>>({})
  const [errors,  setErrors]    = useState<Record<string, string>>({})
  const [filter,  setFilter]    = useState<'missing' | 'all'>('missing')

  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const labourRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const displayedProducts = filter === 'missing'
    ? products.filter(p => !p.weight_grams)
    : products

  const missingCount = products.filter(p => !p.weight_grams).length

  async function saveProduct(productId: string) {
    const weightVal = weights[productId]?.trim()
    const labourVal = labours[productId]?.trim()

    // Nothing to save
    if (!weightVal && !labourVal) return

    setSaving(prev => ({ ...prev, [productId]: true }))
    setErrors(prev => { const n = { ...prev }; delete n[productId]; return n })

    try {
      const body: any = {}
      if (weightVal) body.weight_grams = parseInt(weightVal)
      else body.weight_grams = null
      if (labourVal) body.labour_pct = parseFloat(labourVal)
      else body.labour_pct = null

      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Send existing values so PUT doesn't wipe them
          name: products.find(p => p.id === productId)?.name,
          price: products.find(p => p.id === productId)?.price,
          category: products.find(p => p.id === productId)?.category,
          code: products.find(p => p.id === productId)?.code,
          ...body,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setSaved(prev => ({ ...prev, [productId]: true }))
      setTimeout(() => setSaved(prev => ({ ...prev, [productId]: false })), 2000)
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [productId]: err.message }))
    } finally {
      setSaving(prev => ({ ...prev, [productId]: false }))
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    productId: string,
    field: 'weight' | 'labour',
    index: number
  ) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      saveProduct(productId)

      if (field === 'weight') {
        // Move to labour field of same row
        labourRefs.current[productId]?.focus()
      } else {
        // Move to weight field of next row
        const nextProduct = displayedProducts[index + 1]
        if (nextProduct) {
          weightRefs.current[nextProduct.id]?.focus()
        }
      }
    }
  }

  async function saveAll() {
    for (const p of displayedProducts) {
      await saveProduct(p.id)
    }
  }

  function getCategoryColor(category: string | null) {
    const cat = (category || '').toLowerCase()
    if (cat.includes('cake'))   return 'bg-pink-100 text-pink-800'
    if (cat.includes('bread'))  return 'bg-amber-100 text-amber-800'
    if (cat.includes('roll') || cat.includes('bun')) return 'bg-orange-100 text-orange-800'
    if (cat.includes('pie'))    return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">

      {/* ── Header ───────────────────────────────────────────────── */}
      <a
        href="/admin/products"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </a>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bulk Weight Entry</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tab to move between fields — saves automatically on Tab/Enter
          </p>
        </div>
        <button
          onClick={saveAll}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
          style={{ backgroundColor: '#006A4E' }}
        >
          <Save className="h-4 w-4" /> Save All
        </button>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{products.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Products</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{missingCount}</p>
          <p className="text-xs text-gray-500 mt-1">Missing Weight</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{products.length - missingCount}</p>
          <p className="text-xs text-gray-500 mt-1">Weights Entered</p>
        </div>
      </div>

      {/* ── Filter ───────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('missing')}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'missing'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Missing Weight ({missingCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'all'
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Products ({products.length})
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                Product
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                Category
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                Price
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                Weight (g)
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                Labour % <span className="text-gray-400 normal-case">(blank=global 30%)</span>
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {displayedProducts.map((product, index) => (
              <tr
                key={product.id}
                className={`border-b last:border-0 transition-colors ${
                  saved[product.id] ? 'bg-green-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Product name */}
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-800">{product.name}</div>
                  {product.code && (
                    <div className="text-xs font-mono text-gray-400">#{product.code}</div>
                  )}
                </td>

                {/* Category */}
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(product.category)}`}>
                    {product.category || 'None'}
                  </span>
                </td>

                {/* Price */}
                <td className="px-4 py-3 text-right text-sm text-gray-600 font-mono">
                  ${product.price.toFixed(2)}
                </td>

                {/* Weight input */}
                <td className="px-4 py-3">
                  <input
                    ref={el => { weightRefs.current[product.id] = el }}
                    type="number"
                    min="1"
                    step="1"
                    value={weights[product.id] ?? ''}
                    onChange={e => setWeights(prev => ({ ...prev, [product.id]: e.target.value }))}
                    onKeyDown={e => handleKeyDown(e, product.id, 'weight', index)}
                    onBlur={() => saveProduct(product.id)}
                    placeholder="e.g. 450"
                    className={`w-28 px-2 py-1.5 border rounded font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      errors[product.id]
                        ? 'border-red-400 bg-red-50'
                        : saved[product.id]
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-300'
                    }`}
                  />
                </td>

                {/* Labour % input */}
                <td className="px-4 py-3">
                  <input
                    ref={el => { labourRefs.current[product.id] = el }}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={labours[product.id] ?? ''}
                    onChange={e => setLabours(prev => ({ ...prev, [product.id]: e.target.value }))}
                    onKeyDown={e => handleKeyDown(e, product.id, 'labour', index)}
                    onBlur={() => saveProduct(product.id)}
                    placeholder="30"
                    className={`w-24 px-2 py-1.5 border rounded font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      errors[product.id]
                        ? 'border-red-400 bg-red-50'
                        : saved[product.id]
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-300'
                    }`}
                  />
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  {saving[product.id] && (
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {saved[product.id] && !saving[product.id] && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {errors[product.id] && (
                    <div>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs text-red-600 mt-1">{errors[product.id]}</p>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {displayedProducts.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">All products have weights!</p>
          </div>
        )}
      </div>

      {/* ── Bottom Save All ───────────────────────────────────────── */}
      {displayedProducts.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveAll}
            className="flex items-center gap-2 px-6 py-3 rounded-md text-white font-semibold hover:opacity-90"
            style={{ backgroundColor: '#006A4E' }}
          >
            <Save className="h-4 w-4" /> Save All
          </button>
        </div>
      )}
    </div>
  )
}