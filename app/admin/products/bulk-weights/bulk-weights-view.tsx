'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Product {
  id: string
  name: string
  code: string | null
  category: string | null
  price: number
  weight_grams: number | null
  labour_pct: number | null
  production_type: string | null
  pieces_per_tray: number | null
  dough_weight_grams: number | null
}

const PRODUCTION_TYPES = [
  { value: '', label: '-' },
  { value: 'roll', label: 'Roll' },
  { value: 'bread', label: 'Bread' },
]

const DOUGH_TYPES = ['', 'White', 'Wholemeal', 'Grain']

export default function BulkWeightsView({ products }: { products: Product[] }) {
  const supabase = createClient()

  const [weights, setWeights]           = useState<Record<string, string>>({})
  const [labours, setLabours]           = useState<Record<string, string>>({})
  const [prodTypes, setProdTypes]       = useState<Record<string, string>>({})
  const [perTrays, setPerTrays]         = useState<Record<string, string>>({})
  const [doughWeights, setDoughWeights] = useState<Record<string, string>>({})
  const [doughTypes, setDoughTypes]     = useState<Record<string, string>>({})
  const [hasRecipe, setHasRecipe]       = useState<Record<string, boolean>>({})
  const [saving, setSaving]             = useState<Record<string, boolean>>({})
  const [saved, setSaved]               = useState<Record<string, boolean>>({})
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [filter, setFilter]             = useState<'production' | 'missing' | 'all'>('production')

  // 🆕 Track per-field dirty state — only edited fields will be saved
  const [dirty, setDirty]               = useState<Record<string, Set<string>>>({})

  // Init state from products
  useEffect(() => {
    const w:   Record<string, string> = {}
    const l:   Record<string, string> = {}
    const pt:  Record<string, string> = {}
    const ptr: Record<string, string> = {}
    const dw:  Record<string, string> = {}

    products.forEach(p => {
      w[p.id]   = p.weight_grams?.toString()       ?? ''
      l[p.id]   = p.labour_pct?.toString()         ?? ''
      pt[p.id]  = p.production_type                ?? ''
      ptr[p.id] = p.pieces_per_tray?.toString()    ?? ''
      dw[p.id]  = p.dough_weight_grams?.toString() ?? ''
    })

    setWeights(w)
    setLabours(l)
    setProdTypes(pt)
    setPerTrays(ptr)
    setDoughWeights(dw)
    setDirty({})  // Reset dirty tracker when products reload
  }, [products])

  // Load dough types from recipes (and track which products have recipes)
  useEffect(() => {
    const productIds = products.map(p => p.id)
    if (productIds.length === 0) return

    supabase
      .from('recipes')
      .select('product_id, dough_type')
      .in('product_id', productIds)
      .then(({ data }) => {
        const dt: Record<string, string>  = {}
        const hr: Record<string, boolean> = {}
        if (data) {
          data.forEach((r: any) => {
            dt[r.product_id] = r.dough_type || ''
            hr[r.product_id] = true
          })
        }
        setDoughTypes(dt)
        setHasRecipe(hr)
      })
  }, [products])

  // 🆕 Helper to mark a specific field of a product as dirty
  function markDirty(productId: string, field: string) {
    setDirty(prev => {
      const next = { ...prev }
      if (!next[productId]) next[productId] = new Set()
      else next[productId] = new Set(next[productId])
      next[productId].add(field)
      return next
    })
  }

  const productionProducts = products.filter(p => {
    const code = parseInt(p.code || '0')
    return (code >= 2000 && code <= 3750) || p.production_type
  })

  const missingProducts = products.filter(p => !p.weight_grams)

  const displayedProducts =
    filter === 'production' ? productionProducts :
    filter === 'missing'    ? missingProducts    :
    products

  const missingCount    = missingProducts.length
  const productionCount = productionProducts.length

  // 🆕 Count of products that have ANY dirty fields
  const dirtyCount = Object.keys(dirty).filter(
    pid => dirty[pid] && dirty[pid].size > 0
  ).length

  async function saveProduct(productId: string) {
    setSaving(prev => ({ ...prev, [productId]: true }))
    setErrors(prev => { const n = { ...prev }; delete n[productId]; return n })

    try {
      const product = products.find(p => p.id === productId)
      if (!product) return

      const dirtyFields = dirty[productId] || new Set<string>()

      // Build body — ONLY send fields that have been edited
      const body: any = {
        // API still requires name + price for validation
        name:  product.name,
        price: product.price,
      }

      if (dirtyFields.has('weight_grams')) {
        const wv = weights[productId]?.trim()
        body.weight_grams = wv ? parseInt(wv) : null
      }

      if (dirtyFields.has('labour_pct')) {
        const lv = labours[productId]?.trim()
        body.labour_pct = lv ? parseFloat(lv) : null
      }

      if (dirtyFields.has('production_type')) {
        body.production_type = prodTypes[productId] || null
      }

      if (dirtyFields.has('pieces_per_tray')) {
        body.pieces_per_tray = perTrays[productId]?.trim()
          ? parseInt(perTrays[productId])
          : null
      }

      if (dirtyFields.has('dough_weight_grams')) {
        body.dough_weight_grams = doughWeights[productId]?.trim()
          ? parseFloat(doughWeights[productId])
          : null
      }

      // Only call API if there's something to update
      const hasProductChanges = Object.keys(body).some(
        k => k !== 'name' && k !== 'price'
      )

      if (hasProductChanges) {
        const res = await fetch(`/api/products/${productId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })

        const data = await res.json()
        if (data.error) throw new Error(data.error)
      }

      // Save dough type to recipe if dirty (auto-create recipe if missing)
      if (dirtyFields.has('dough_type')) {
        const dt = doughTypes[productId]
        if (dt) {
          const { data: recipe } = await supabase
            .from('recipes')
            .select('id')
            .eq('product_id', productId)
            .maybeSingle()

          if (recipe) {
            await supabase.from('recipes').update({ dough_type: dt }).eq('id', recipe.id)
          } else {
            const { error: insertError } = await supabase
              .from('recipes')
              .insert({ product_id: productId, dough_type: dt })

            if (!insertError) {
              setHasRecipe(prev => ({ ...prev, [productId]: true }))
            }
          }
        }
      }

      // 🆕 Clear dirty fields for this product after successful save
      setDirty(prev => {
        const next = { ...prev }
        delete next[productId]
        return next
      })

      setSaved(prev => ({ ...prev, [productId]: true }))
      setTimeout(() => setSaved(prev => ({ ...prev, [productId]: false })), 2000)
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [productId]: err.message }))
    } finally {
      setSaving(prev => ({ ...prev, [productId]: false }))
    }
  }

  // 🆕 Save All — only saves rows with dirty fields
  async function saveAll() {
    const dirtyIds = Object.keys(dirty).filter(
      pid => dirty[pid] && dirty[pid].size > 0
    )

    if (dirtyIds.length === 0) {
      alert('No changes to save.')
      return
    }

    if (!confirm(`Save changes to ${dirtyIds.length} product${dirtyIds.length !== 1 ? 's' : ''}?`)) {
      return
    }

    for (const id of dirtyIds) {
      await saveProduct(id)
    }
  }

  function getCategoryColor(category: string | null) {
    const cat = (category || '').toLowerCase()
    if (cat.includes('cake'))  return 'bg-pink-100 text-pink-800'
    if (cat.includes('bread')) return 'bg-amber-100 text-amber-800'
    if (cat.includes('roll') || cat.includes('bun')) return 'bg-orange-100 text-orange-800'
    if (cat.includes('pie'))   return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-700'
  }

  // Count products that have production_type but no recipe (warning badge)
  const noRecipeCount = displayedProducts.filter(
    p => prodTypes[p.id] && !hasRecipe[p.id]
  ).length

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">

      <a href="/admin/products" className="flex items-center gap-1 text-sm mb-4 hover:opacity-80" style={{ color: '#CE1126' }}>
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </a>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bulk Production Setup</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure weights, production type, dough data — saves on blur or Tab
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={dirtyCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed"
          style={{ backgroundColor: dirtyCount > 0 ? '#006A4E' : undefined }}
        >
          <Save className="h-4 w-4" />
          {dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? 's' : ''}` : 'No changes'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{products.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Products</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{productionCount}</p>
          <p className="text-xs text-gray-500 mt-1">Bread/Roll Range</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{missingCount}</p>
          <p className="text-xs text-gray-500 mt-1">Missing Weight</p>
        </div>
      </div>

      {/* No-recipe warning banner */}
      {noRecipeCount > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-800">
              {noRecipeCount} product{noRecipeCount !== 1 ? 's' : ''} missing recipe
            </p>
            <p className="text-red-700 mt-0.5">
              Set a Dough Type for these products to auto-create a recipe. Without a recipe, they won&apos;t appear in the Dough Calculator.
            </p>
          </div>
        </div>
      )}

      {/* Unsaved changes banner */}
      {dirtyCount > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">
              {dirtyCount} product{dirtyCount !== 1 ? 's' : ''} with unsaved changes
            </p>
            <p className="text-amber-700 mt-0.5">
              Click Save above or Tab out of any field to save individual rows.
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('production')}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'production' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          🧮 Bread & Rolls ({productionCount})
        </button>
        <button
          onClick={() => setFilter('missing')}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'missing' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Missing Weight ({missingCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All ({products.length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase">Product</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase">Cat</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-600 uppercase">Price</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase">Weight (g)</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase">Labour %</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase" style={{ color: '#006A4E' }}>Type</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase" style={{ color: '#006A4E' }}>Per Tray</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase" style={{ color: '#006A4E' }}>Dough (g)</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase" style={{ color: '#006A4E' }}>Dough Type</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {displayedProducts.map((product) => {
              const needsRecipe = prodTypes[product.id] && !hasRecipe[product.id]
              const rowDirty    = dirty[product.id] && dirty[product.id].size > 0

              return (
                <tr
                  key={product.id}
                  className={`border-b last:border-0 transition-colors ${
                    saved[product.id] ? 'bg-green-50' :
                    rowDirty           ? 'bg-amber-50/50' :
                    'hover:bg-gray-50'
                  }`}
                >
                  {/* Product */}
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                      {product.name}
                      {needsRecipe && (
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded border border-red-300"
                          title="No recipe linked — set a Dough Type to auto-create one"
                        >
                          ⚠️ No recipe
                        </span>
                      )}
                      {rowDirty && (
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded border border-amber-300"
                          title="Unsaved changes"
                        >
                          ● Unsaved
                        </span>
                      )}
                    </div>
                    {product.code && <div className="text-xs font-mono text-gray-400">#{product.code}</div>}
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(product.category)}`}>
                      {product.category || '-'}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2 text-right text-sm text-gray-600 font-mono">
                    ${product.price.toFixed(2)}
                  </td>

                  {/* Weight */}
                  <td className="px-3 py-2">
                    <input
                      type="number" min="1" step="1"
                      value={weights[product.id] ?? ''}
                      onChange={e => {
                        setWeights(prev => ({ ...prev, [product.id]: e.target.value }))
                        markDirty(product.id, 'weight_grams')
                      }}
                      onBlur={() => saveProduct(product.id)}
                      placeholder="g"
                      className="w-20 px-2 py-1 border rounded font-mono text-sm focus:ring-2 focus:ring-green-500"
                    />
                  </td>

                  {/* Labour */}
                  <td className="px-3 py-2">
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={labours[product.id] ?? ''}
                      onChange={e => {
                        setLabours(prev => ({ ...prev, [product.id]: e.target.value }))
                        markDirty(product.id, 'labour_pct')
                      }}
                      onBlur={() => saveProduct(product.id)}
                      placeholder="30"
                      className="w-16 px-2 py-1 border rounded font-mono text-sm focus:ring-2 focus:ring-green-500"
                    />
                  </td>

                  {/* Production Type */}
                  <td className="px-3 py-2">
                    <select
                      value={prodTypes[product.id] ?? ''}
                      onChange={e => {
                        setProdTypes(prev => ({ ...prev, [product.id]: e.target.value }))
                        markDirty(product.id, 'production_type')
                        setTimeout(() => saveProduct(product.id), 100)
                      }}
                      className={[
                        'w-20 px-1 py-1 border rounded text-xs font-medium focus:ring-2 focus:ring-green-500',
                        prodTypes[product.id] === 'roll'  ? 'bg-orange-50 border-orange-300 text-orange-800' :
                        prodTypes[product.id] === 'bread' ? 'bg-amber-50 border-amber-300 text-amber-800'   :
                        'bg-white border-gray-300',
                      ].join(' ')}
                    >
                      {PRODUCTION_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Per Tray */}
                  <td className="px-3 py-2">
                    {prodTypes[product.id] === 'roll' ? (
                      <input
                        type="number" min="1" step="1"
                        value={perTrays[product.id] ?? ''}
                        onChange={e => {
                          setPerTrays(prev => ({ ...prev, [product.id]: e.target.value }))
                          markDirty(product.id, 'pieces_per_tray')
                        }}
                        onBlur={() => saveProduct(product.id)}
                        placeholder="15"
                        className="w-16 px-2 py-1 border border-orange-300 rounded font-mono text-sm focus:ring-2 focus:ring-orange-400 bg-orange-50"
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>

                  {/* Dough Weight */}
                  <td className="px-3 py-2">
                    {prodTypes[product.id] ? (
                      <input
                        type="number" min="1" step="1"
                        value={doughWeights[product.id] ?? ''}
                        onChange={e => {
                          setDoughWeights(prev => ({ ...prev, [product.id]: e.target.value }))
                          markDirty(product.id, 'dough_weight_grams')
                        }}
                        onBlur={() => saveProduct(product.id)}
                        placeholder={prodTypes[product.id] === 'roll' ? '45' : '520'}
                        className="w-20 px-2 py-1 border border-green-300 rounded font-mono text-sm focus:ring-2 focus:ring-green-400 bg-green-50"
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>

                  {/* Dough Type */}
                  <td className="px-3 py-2">
                    {prodTypes[product.id] ? (
                      <select
                        value={doughTypes[product.id] ?? ''}
                        onChange={e => {
                          setDoughTypes(prev => ({ ...prev, [product.id]: e.target.value }))
                          markDirty(product.id, 'dough_type')
                          setTimeout(() => saveProduct(product.id), 100)
                        }}
                        className={[
                          'w-24 px-1 py-1 border rounded text-xs font-medium focus:ring-2',
                          needsRecipe
                            ? 'border-red-400 bg-red-50 focus:ring-red-400'
                            : 'border-blue-300 bg-blue-50 focus:ring-blue-400',
                        ].join(' ')}
                      >
                        {DOUGH_TYPES.map(dt => (
                          <option key={dt} value={dt}>{dt || '-'}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    {saving[product.id] && <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />}
                    {saved[product.id] && !saving[product.id] && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {errors[product.id] && (
                      <div>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <p className="text-xs text-red-600 mt-1">{errors[product.id]}</p>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {displayedProducts.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">No products to show</p>
          </div>
        )}
      </div>

      {displayedProducts.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveAll}
            disabled={dirtyCount === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed"
            style={{ backgroundColor: dirtyCount > 0 ? '#006A4E' : undefined }}
          >
            <Save className="h-4 w-4" />
            {dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? 's' : ''}` : 'No changes'}
          </button>
        </div>
      )}
    </div>
  )
}