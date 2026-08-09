'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  product_code: string | null
  category: string | null
}

interface Ingredient {
  id: string
  name: string
}

interface TracedProduct {
  id: string
  name: string
}

type RecallType = 'product' | 'ingredient'

export default function NewRecallPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(false)
  const [recallType, setRecallType] = useState<RecallType>('product')

  const [tracedProducts, setTracedProducts] = useState<TracedProduct[]>([])
  const [tracing, setTracing] = useState(false)

  const [formData, setFormData] = useState({
    product_id: '',
    product_name: '',
    ingredient_id: '',
    ingredient_name: '',
    reason: '',
    severity: 'medium',
    date_from: '',
    date_to: '',
    initiated_by: '',
    notes: '',
  })
  const [affectedCount, setAffectedCount] = useState<number | null>(null)

  useEffect(() => {
    fetchProducts()
    fetchIngredients()
  }, [])

  async function fetchProducts() {
    try {
      const res = await fetch('/api/admin/products/list')
      const data = await res.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  async function fetchIngredients() {
    try {
      const res = await fetch('/api/admin/ingredients/list')
      const data = await res.json()
      setIngredients(data.ingredients || [])
    } catch (error) {
      console.error('Error fetching ingredients:', error)
    }
  }

  function switchRecallType(type: RecallType) {
    setRecallType(type)
    setTracedProducts([])
    setFormData(prev => ({
      ...prev,
      product_id: '',
      product_name: '',
      ingredient_id: '',
      ingredient_name: '',
    }))
  }

  function handleProductChange(productId: string) {
    const product = products.find(p => p.id === productId)
    setFormData(prev => ({
      ...prev,
      product_id: productId,
      product_name: product?.name || '',
    }))
  }

  async function handleIngredientChange(ingredientId: string) {
    const ingredient = ingredients.find(i => i.id === ingredientId)
    setFormData(prev => ({
      ...prev,
      ingredient_id: ingredientId,
      ingredient_name: ingredient?.name || '',
    }))
    setTracedProducts([])

    if (!ingredientId) return

    setTracing(true)
    try {
      const res = await fetch(`/api/admin/recalls/trace?ingredient_id=${ingredientId}`)
      const data = await res.json()
      if (res.ok) {
        setTracedProducts(data.products || [])
      } else {
        console.error('Trace error:', data.error)
      }
    } catch (error) {
      console.error('Error tracing ingredient:', error)
    } finally {
      setTracing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.reason || !formData.date_from || !formData.date_to) {
      alert('Please fill in all required fields')
      return
    }

    if (recallType === 'product' && !formData.product_id) {
      alert('Please select a product')
      return
    }

    if (recallType === 'ingredient' && !formData.ingredient_id) {
      alert('Please select an ingredient')
      return
    }

    if (recallType === 'ingredient' && tracedProducts.length === 0) {
      alert('This ingredient does not flow into any products, so there is nothing to recall.')
      return
    }

    if (new Date(formData.date_from) > new Date(formData.date_to)) {
      alert('Date From must be before Date To')
      return
    }

    setLoading(true)

    try {
      const payload =
        recallType === 'ingredient'
          ? {
              recall_type: 'ingredient',
              ingredient_id: formData.ingredient_id,
              ingredient_name: formData.ingredient_name,
              reason: formData.reason,
              severity: formData.severity,
              date_from: formData.date_from,
              date_to: formData.date_to,
              initiated_by: formData.initiated_by,
              notes: formData.notes,
            }
          : {
              recall_type: 'product',
              product_id: formData.product_id,
              product_name: formData.product_name,
              reason: formData.reason,
              severity: formData.severity,
              date_from: formData.date_from,
              date_to: formData.date_to,
              initiated_by: formData.initiated_by,
              notes: formData.notes,
            }

      const res = await fetch('/api/admin/recalls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create recall')
      }

      setAffectedCount(data.affected_count)

      setTimeout(() => {
        router.push(`/admin/recalls/${data.recall.id}`)
      }, 2000)
    } catch (error: any) {
      alert(`Error: ${error.message}`)
      setLoading(false)
    }
  }

  if (affectedCount !== null) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="mb-4 text-green-600">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Recall Created</h2>
          <p className="text-gray-600 mb-4">
            {affectedCount === 0
              ? 'No customers were affected by this recall.'
              : `${affectedCount} customer${affectedCount !== 1 ? 's' : ''} identified as affected.`
            }
          </p>
          <p className="text-sm text-gray-500">Redirecting to recall details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/recalls" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Recalls
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create Product Recall</h1>
          <p className="text-gray-600 mt-2">Initiate a new recall and identify affected customers</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">

          {/* Recall Type Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Recall By <span className="text-red-600">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => switchRecallType('product')}
                className={`flex-1 px-4 py-2 rounded-lg font-semibold border transition-colors ${
                  recallType === 'product'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Product
              </button>
              <button
                type="button"
                onClick={() => switchRecallType('ingredient')}
                className={`flex-1 px-4 py-2 rounded-lg font-semibold border transition-colors ${
                  recallType === 'ingredient'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Ingredient
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {recallType === 'product'
                ? 'Recall a single product across the selected date range.'
                : 'Recall every product this ingredient flows into, including via sub-recipes.'}
            </p>
          </div>

          {/* Product Selection */}
          {recallType === 'product' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Product <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.product_id}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} {product.product_code ? `(${product.product_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Ingredient Selection + Preview */}
          {recallType === 'ingredient' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Ingredient <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.ingredient_id}
                onChange={(e) => handleIngredientChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select an ingredient</option>
                {ingredients.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </option>
                ))}
              </select>

              {tracing && (
                <p className="text-sm text-gray-500 mt-3">Tracing affected products…</p>
              )}

              {!tracing && formData.ingredient_id && (
                <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">
                      {tracedProducts.length === 0
                        ? 'No products use this ingredient.'
                        : `This ingredient flows into ${tracedProducts.length} product${tracedProducts.length !== 1 ? 's' : ''}. All will be included in the recall.`}
                    </p>
                  </div>
                  {tracedProducts.length > 0 && (
                    <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                      {tracedProducts.map((p) => (
                        <li key={p.id} className="px-4 py-2 text-sm text-gray-700">
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Severity */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Severity <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low - Quality issue</option>
              <option value="medium">Medium - Minor safety concern</option>
              <option value="high">High - Significant safety risk</option>
              <option value="critical">Critical - Immediate health hazard</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Date From <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.date_from}
                onChange={(e) => setFormData(prev => ({ ...prev, date_from: e.target.value }))}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Date To <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.date_to}
                onChange={(e) => setFormData(prev => ({ ...prev, date_to: e.target.value }))}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Reason for Recall <span className="text-red-600">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              required
              rows={4}
              placeholder="Describe the reason for this recall (e.g., potential contamination, quality defect, labeling error)..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Initiated By */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Initiated By
            </label>
            <input
              type="text"
              value={formData.initiated_by}
              onChange={(e) => setFormData(prev => ({ ...prev, initiated_by: e.target.value }))}
              placeholder="Your name or role"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Internal Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Additional notes for internal tracking..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading || tracing}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Creating Recall...' : 'Create Recall'}
            </button>
            <Link
              href="/admin/recalls"
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>

        </form>

      </div>
    </div>
  )
}