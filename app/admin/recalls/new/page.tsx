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

export default function NewRecallPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    product_id: '',
    product_name: '',
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

  function handleProductChange(productId: string) {
    const product = products.find(p => p.id === productId)
    setFormData({
      ...formData,
      product_id: productId,
      product_name: product?.name || '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!formData.product_id || !formData.reason || !formData.date_from || !formData.date_to) {
      alert('Please fill in all required fields')
      return
    }

    if (new Date(formData.date_from) > new Date(formData.date_to)) {
      alert('Date From must be before Date To')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/admin/recalls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create recall')
      }

      setAffectedCount(data.affected_count)
      
      // Redirect after showing count
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
          <p className="text-gray-600 mt-2">Initiate a new product recall and identify affected customers</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          
          {/* Product Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Product <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.product_id}
              onChange={(e) => handleProductChange(e.target.value)}
              required
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

          {/* Severity */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Severity <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, initiated_by: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes for internal tracking..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
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