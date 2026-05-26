'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Save,
  Search,
  User,
  Package,
  Trash2,
  X,
} from 'lucide-react'

interface Customer {
  id: string
  business_name: string
  email: string
  address: string | null
  abn: string | null
}

interface Product {
  id: string
  name: string
  price: number
  category: string | null
}

interface LineItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  total: number
}

interface QuoteSettings {
  default_terms: string
  default_valid_days: number
  gst_rate: number
}

export default function NewQuotePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<QuoteSettings | null>(null)

  // Customer selection
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Line items
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  // Quote details
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [validDays, setValidDays] = useState(30)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      // Fetch customers
const custRes = await fetch('/api/customers')
      if (custRes.ok) {
        const custData = await custRes.json()
        setCustomers(custData.customers || custData || [])
      }

      // Fetch products
      const prodRes = await fetch('/api/admin/products/list')
      if (prodRes.ok) {
        const prodData = await prodRes.json()
        setProducts(prodData.products || prodData || [])
      }

      // Fetch quote settings (may not exist yet)
      try {
        const settingsRes = await fetch('/api/quotes?settings=true')
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          if (settingsData.settings) {
            setSettings(settingsData.settings)
            setTerms(settingsData.settings.default_terms || '')
            setValidDays(settingsData.settings.default_valid_days || 30)
          }
        }
      } catch {
        // Settings table may not exist yet, that's fine
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const gstRate = settings?.gst_rate || 10
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const gst = subtotal * (gstRate / 100)
  const total = subtotal + gst

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10)
    const lower = customerSearch.toLowerCase()
    return customers
      .filter(
        (c) =>
          c.business_name?.toLowerCase().includes(lower) ||
          c.email?.toLowerCase().includes(lower)
      )
      .slice(0, 10)
  }, [customerSearch, customers])

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 15)
    const lower = productSearch.toLowerCase()
    return products
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(lower) ||
          p.category?.toLowerCase().includes(lower)
      )
      .slice(0, 15)
  }, [productSearch, products])

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerSearch('')
    setShowCustomerDropdown(false)
  }

  function addProduct(p: Product) {
    const existing = items.findIndex((item) => item.product_id === p.id)
    if (existing >= 0) {
      const updated = [...items]
      updated[existing].quantity += 1
      updated[existing].total = updated[existing].quantity * updated[existing].unit_price
      setItems(updated)
    } else {
      setItems([
        ...items,
        {
          product_id: p.id,
          product_name: p.name,
          quantity: 1,
          unit_price: p.price,
          total: p.price,
        },
      ])
    }
    setProductSearch('')
    setShowProductDropdown(false)
  }

  function updateItem(index: number, field: 'quantity' | 'unit_price', value: number) {
    const updated = [...items]
    updated[index][field] = value
    updated[index].total = updated[index].quantity * updated[index].unit_price
    setItems(updated)
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  async function saveQuote() {
    if (!selectedCustomer) return alert('Please select a customer')
    if (items.length === 0) return alert('Please add at least one product')

    setSaving(true)
    try {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + validDays)

      const body = {
        customer_id: selectedCustomer.id,
      items: items.map((item) => ({
  product_id: item.product_id,
  name: item.product_name,
  quantity: item.quantity,
  unit_price: item.unit_price,
})),
        subtotal,
        gst,
        total,
        notes: notes || null,
        terms: terms || null,
        valid_until: validUntil.toISOString().split('T')[0],
      }

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create quote')
      }

      const data = await res.json()
      router.push(`/admin/quotes/${data.id || data.quote?.id}`)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/quotes')}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">New Quote</h1>
          </div>
          <button
            onClick={saveQuote}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Selection */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer
              </h2>
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div>
                    <p className="font-medium text-gray-900">{selectedCustomer.business_name}</p>
                    <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                    {selectedCustomer.address && (
                      <p className="text-sm text-gray-500">{selectedCustomer.address}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="p-1.5 hover:bg-blue-100 rounded transition"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      setShowCustomerDropdown(true)
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  {showCustomerDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500">No customers found</div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectCustomer(c)}
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition border-b border-gray-50 last:border-0"
                          >
                            <p className="font-medium text-gray-900">{c.business_name}</p>
                            <p className="text-xs text-gray-500">{c.email}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Products
              </h2>

              {/* Product Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products to add..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setShowProductDropdown(true)
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                {showProductDropdown && productSearch && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">No products found</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addProduct(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition border-b border-gray-50 last:border-0 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{p.name}</p>
                            {p.category && <p className="text-xs text-gray-500">{p.category}</p>}
                          </div>
                          <span className="text-sm font-medium text-gray-600">
                            ${p.price?.toFixed(2)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Items Table */}
              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">Search and add products above</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Product</th>
                        <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase w-24">Qty</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase w-32">Unit Price</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase w-28">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2.5 text-sm font-medium text-gray-900">
                            {item.product_name}
                          </td>
                          <td className="py-2.5">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-20 mx-auto block text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-28 ml-auto block text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="py-2.5 text-right text-sm font-medium text-gray-900">
                            ${item.total.toFixed(2)}
                          </td>
                          <td className="py-2.5">
                            <button
                              onClick={() => removeItem(idx)}
                              className="p-1.5 hover:bg-red-50 rounded transition text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notes & Terms */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes or special instructions..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Payment terms, delivery conditions..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Sidebar — Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
              <h2 className="font-semibold text-gray-900 mb-4">Quote Summary</h2>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Items</span>
                  <span className="font-medium">{items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">GST ({gstRate}%)</span>
                  <span className="font-medium">${gst.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-lg text-gray-900">${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valid for (days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={validDays}
                  onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <button
                onClick={saveQuote}
                disabled={saving || !selectedCustomer || items.length === 0}
                className="w-full mt-5 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}