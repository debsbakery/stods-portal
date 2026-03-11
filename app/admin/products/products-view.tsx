'use client';

import { useState, useEffect } from 'react';
import { Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string | null;
  category: string | null;
  image_url: string | null;
  code: string | null;
  allow_custom_description?: boolean;
  allow_custom_price?: boolean;
  gst_applicable: boolean;
}

const CODE_RANGES = [
  { min: 1000, max: 1999, label: '🎂 Cakes',  color: 'bg-pink-50 border-pink-200' },
  { min: 2000, max: 2750, label: '🍞 Bread',  color: 'bg-amber-50 border-amber-200' },
  { min: 2751, max: 3750, label: '🥖 Rolls',  color: 'bg-orange-50 border-orange-200' },
  { min: 3751, max: 4000, label: '🥧 Pies',   color: 'bg-yellow-50 border-yellow-200' },
  { min: 4001, max: 9999, label: '🧁 Other',  color: 'bg-gray-50 border-gray-200' },
]

function getCodeRangeInfo(code: string | null) {
  if (!code) return { label: '❓ No Code', color: 'bg-gray-100 border-gray-300', range: 'none' }
  if (code === '900') return { label: '⚙️ Administrative', color: 'bg-blue-50 border-blue-200', range: 'admin' }
  const codeNum = parseInt(code)
  const range = CODE_RANGES.find(r => codeNum >= r.min && codeNum <= r.max)
  return range
    ? { ...range, range: `${range.min}-${range.max}` }
    : { label: '❓ Uncategorized', color: 'bg-gray-100 border-gray-300', range: 'other' }
}

export default function ProductsView() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grid')

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/products')
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setProducts(data.products || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      const response = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete product')
      fetchProducts()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const toggleGst = async (product: Product) => {
    const newValue = !product.gst_applicable

    // Optimistic update
    setProducts(prev => prev.map(p =>
      p.id === product.id ? { ...p, gst_applicable: newValue } : p
    ))

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gst_applicable: newValue }),
      })
      if (!res.ok) throw new Error('Failed to update GST')
    } catch (err: any) {
      // Revert on error
      setProducts(prev => prev.map(p =>
        p.id === product.id ? { ...p, gst_applicable: !newValue } : p
      ))
      alert('Failed to update GST status')
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)

  // Group products by code range
  const groupedProducts = products.reduce((acc: any, product) => {
    const rangeInfo = getCodeRangeInfo(product.code)
    const key = rangeInfo.range
    if (!acc[key]) acc[key] = { ...rangeInfo, products: [] }
    acc[key].products.push(product)
    return acc
  }, {})

  Object.values(groupedProducts).forEach((group: any) => {
    group.products.sort((a: Product, b: Product) => {
      const codeA = parseInt(a.code || '99999')
      const codeB = parseInt(b.code || '99999')
      return codeA - codeB
    })
  })

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
        <p className="mt-3 text-gray-500">Loading products...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-semibold">❌ Error loading products</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    )
  }

  const ProductCard = ({ product }: { product: Product }) => {
    const rangeInfo = getCodeRangeInfo(product.code)
    return (
      <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">

        {/* Product Code Badge */}
        {product.code && (
          <div className={`px-3 py-1 text-xs font-mono font-bold ${rangeInfo.color} border-b flex justify-between items-center`}>
            <span>Code: {product.code}</span>
            {product.allow_custom_description && (
              <span className="text-blue-600 text-[10px]">CUSTOM ✨</span>
            )}
          </div>
        )}

        {/* Product Image */}
        <div className="aspect-square bg-gray-100 relative">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-16 w-16 text-gray-300" />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="p-4">
          <h3 className="text-lg font-bold mb-1">{product.name}</h3>
          {product.category && (
            <p className="text-xs text-gray-500 mb-2">{product.category}</p>
          )}
          {product.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>
          )}
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold" style={{ color: "#006A4E" }}>
              {formatCurrency(product.price)}
            </p>
            <button
              onClick={e => { e.preventDefault(); toggleGst(product) }}
              title="Click to toggle GST"
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border transition-colors ${
                product.gst_applicable
                  ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {product.gst_applicable ? '✓ GST' : '✗ No GST'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-2">
          <Link
            href={`/admin/products/${product.id}`}
            className="flex-1 text-center px-3 py-2 rounded-md text-white text-sm font-semibold hover:opacity-90"
            style={{ backgroundColor: "#006A4E" }}
          >
            <Edit className="h-4 w-4 inline mr-1" />
            Edit
          </Link>
          <button
            onClick={() => handleDelete(product.id, product.name)}
            className="px-3 py-2 rounded-md bg-red-100 text-red-700 hover:bg-red-200"
            title="Delete product"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="col-span-full bg-white rounded-lg shadow-md p-12 text-center">
        <ImageIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">No products yet</p>
        <Link
          href="/admin/products/create"
          className="inline-block mt-4 px-6 py-2 rounded-md text-white font-semibold hover:opacity-90"
          style={{ backgroundColor: "#006A4E" }}
        >
          + Add First Product
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* View Mode Toggle */}
      <div className="mb-6 flex gap-2 bg-white rounded-lg shadow p-2 w-fit">
        <button
          onClick={() => setViewMode('grid')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'grid'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📊 Grid View
        </button>
        <button
          onClick={() => setViewMode('grouped')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'grouped'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📋 Grouped by Code
        </button>
      </div>

      {/* Code Range Legend */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3 text-sm text-gray-700">📋 Product Code Ranges</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {CODE_RANGES.map(range => (
            <div key={range.label} className={`p-2 rounded border text-center text-xs ${range.color}`}>
              <div className="font-mono font-bold">{range.min}-{range.max}</div>
              <div className="text-[10px] mt-0.5">{range.label}</div>
            </div>
          ))}
          <div className="p-2 rounded border text-center text-xs bg-blue-50 border-blue-200">
            <div className="font-mono font-bold">900</div>
            <div className="text-[10px] mt-0.5">⚙️ Admin</div>
          </div>
        </div>
      </div>

      {/* Products Display */}
      {viewMode === 'grid' ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {products
            .sort((a, b) => parseInt(a.code || '99999') - parseInt(b.code || '99999'))
            .map(product => <ProductCard key={product.id} product={product} />)
          }
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(groupedProducts).map((group: any) => (
            <div key={group.range} className="bg-white rounded-lg shadow overflow-hidden">
              <div className={`p-4 border-b-2 ${group.color}`}>
                <h2 className="font-bold text-lg">{group.label}</h2>
                <p className="text-sm text-gray-600">
                  {group.range !== 'none' && group.range !== 'admin' && group.range !== 'other'
                    ? `Code Range: ${group.range}`
                    : group.range === 'admin'
                    ? 'Special administrative products'
                    : 'Products without codes'}
                </p>
              </div>
              <div className="p-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {group.products.map((product: Product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}