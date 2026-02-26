'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Edit2, DollarSign } from 'lucide-react'

interface Customer {
  id: string
  business_name: string
  email: string
}

interface Product {
  id: string
  product_number: string
  name: string
  price: number
}

interface ContractPrice {
  id: string
  customer_id: string
  product_id: string
  contract_price: number
  effective_from: string
  effective_to: string | null
  product_number: string
  product_name: string
  standard_price: number
}

export default function ContractPricingPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [contracts, setContracts] = useState<ContractPrice[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    productId: '',
    contractPrice: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: ''
  })

  const supabase = createClient()

  useEffect(() => {
    loadCustomers()
    loadProducts()
  }, [])

  useEffect(() => {
    if (selectedCustomer) {
      loadContracts(selectedCustomer)
    }
  }, [selectedCustomer])

 async function loadCustomers() {
  console.log('🔍 Loading customers...')
  
  const { data, error } = await supabase
    .from('customers')
    .select('id, business_name, email')
    .order('business_name')

  console.log('📊 Customers loaded:', data?.length)
  console.log('📊 Customers:', data)
  console.log('❌ Error:', error)

  if (data) setCustomers(data)
  setLoading(false)
}

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, product_number, name, price')
      .order('product_number')

    if (data) setProducts(data)
  }

  async function loadContracts(customerId: string) {
    const response = await fetch(`/api/admin/contract-pricing?customerId=${customerId}`)
    const result = await response.json()
    
    if (result.success) {
      setContracts(result.contracts)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const response = await fetch('/api/admin/contract-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: selectedCustomer,
        productId: formData.productId,
        contractPrice: parseFloat(formData.contractPrice),
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || null
      })
    })

    const result = await response.json()

    if (result.success) {
      loadContracts(selectedCustomer)
      setShowForm(false)
      setFormData({
        productId: '',
        contractPrice: '',
        effectiveFrom: new Date().toISOString().split('T')[0],
        effectiveTo: ''
      })
    } else {
      alert('Error saving contract: ' + result.error)
    }
  }

  async function handleDelete(contractId: string) {
    if (!confirm('Delete this contract price?')) return

    const response = await fetch(`/api/admin/contract-pricing?id=${contractId}`, {
      method: 'DELETE'
    })

    const result = await response.json()

    if (result.success) {
      loadContracts(selectedCustomer)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount)
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
          <DollarSign className="h-8 w-8" />
          Contract Pricing
        </h1>
        <p className="text-gray-600 mt-2">Manage customer-specific pricing</p>
      </div>

      {/* Customer Selector */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <label className="block text-sm font-medium mb-2">Select Customer</label>
        <select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          className="w-full px-4 py-2 border rounded-md"
        >
          <option value="">-- Choose a customer --</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.business_name || customer.email}
            </option>
          ))}
        </select>
      </div>

      {/* Contracts Table */}
      {selectedCustomer && (
        <>
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Active Contract Prices</h2>
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2 rounded text-white hover:opacity-90"
                style={{ backgroundColor: '#006A4E' }}
              >
                <Plus className="h-4 w-4" />
                Add Contract Price
              </button>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
              <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Product</label>
                    <select
                      value={formData.productId}
                      onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                      required
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">-- Select Product --</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.product_number} - {product.name} (${product.price})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Contract Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.contractPrice}
                      onChange={(e) => setFormData({ ...formData, contractPrice: e.target.value })}
                      required
                      className="w-full px-3 py-2 border rounded"
                      placeholder="5.50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Effective From</label>
                    <input
                      type="date"
                      value={formData.effectiveFrom}
                      onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                      required
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Effective To (Optional)</label>
                    <input
                      type="date"
                      value={formData.effectiveTo}
                      onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded text-white"
                    style={{ backgroundColor: '#006A4E' }}
                  >
                    Save Contract Price
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded border"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Contracts Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Product</th>
                    <th className="text-right py-2">Standard Price</th>
                    <th className="text-right py-2">Contract Price</th>
                    <th className="text-right py-2">Savings</th>
                    <th className="text-left py-2">Effective From</th>
                    <th className="text-left py-2">Effective To</th>
                    <th className="text-center py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        No contract prices set for this customer
                      </td>
                    </tr>
                  ) : (
                    contracts.map((contract) => {
                      const savings = contract.standard_price - contract.contract_price
                      const savingsPercent = (savings / contract.standard_price) * 100

                      return (
                        <tr key={contract.id} className="border-b hover:bg-gray-50">
                          <td className="py-2">
                            <div className="font-medium">{contract.product_name}</div>
                            <div className="text-sm text-gray-500">{contract.product_number}</div>
                          </td>
                          <td className="text-right">{formatCurrency(contract.standard_price)}</td>
                          <td className="text-right font-bold" style={{ color: '#006A4E' }}>
                            {formatCurrency(contract.contract_price)}
                          </td>
                          <td className="text-right">
                            <span className="text-green-600">
                              -{formatCurrency(savings)} ({savingsPercent.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="text-sm">{new Date(contract.effective_from).toLocaleDateString()}</td>
                          <td className="text-sm">
                            {contract.effective_to 
                              ? new Date(contract.effective_to).toLocaleDateString() 
                              : 'Ongoing'}
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => handleDelete(contract.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
