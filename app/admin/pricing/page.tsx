'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, DollarSign, Copy, X, Loader2 } from 'lucide-react'
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select'

interface Customer {
  id: string
  business_name: string
  email: string
}

interface Product {
  id: string
  code: string | null
  name: string
  price: number
  category: string | null
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
  const [formError, setFormError] = useState('')

  // ── Clone modal state ─────────────────────────────────────────
  const [showCloneModal, setShowCloneModal]       = useState(false)
  const [sourceCustomerId, setSourceCustomerId]   = useState('')
  const [sourceContracts, setSourceContracts]     = useState<ContractPrice[]>([])
  const [cloneMode, setCloneMode]                 = useState<'replace' | 'merge'>('merge')
  const [cloning, setCloning]                     = useState(false)
  const [cloneMessage, setCloneMessage]           = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState({
    productId: '',
    contractPrice: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: ''
  })

  useEffect(() => {
    loadCustomers()
    loadProducts()
  }, [])

  useEffect(() => {
    if (selectedCustomer) {
      loadContracts(selectedCustomer)
    }
  }, [selectedCustomer])

  // ── Load source contracts when source customer changes in modal ──
  useEffect(() => {
    if (!sourceCustomerId) {
      setSourceContracts([])
      return
    }
    fetch(`/api/admin/contract-pricing?customerId=${sourceCustomerId}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) setSourceContracts(result.contracts)
      })
  }, [sourceCustomerId])

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers')
      const data = await res.json()
      if (data.customers) setCustomers(data.customers)
    } catch (err) {
      console.error('Failed to load customers:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadProducts() {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      if (data.products) {
        const sorted = [...(data.products as Product[])].sort((a, b) => {
          if (!a.code && !b.code) return a.name.localeCompare(b.name)
          if (!a.code) return 1
          if (!b.code) return -1
          const aNum = parseInt(a.code)
          const bNum = parseInt(b.code)
          if (isNaN(aNum) && isNaN(bNum)) return a.name.localeCompare(b.name)
          if (isNaN(aNum)) return 1
          if (isNaN(bNum)) return -1
          return aNum - bNum
        })
        setProducts(sorted)
      }
    } catch (err) {
      console.error('Failed to load products:', err)
    }
  }

  async function loadContracts(customerId: string) {
    try {
      const res = await fetch(`/api/admin/contract-pricing?customerId=${customerId}`)
      const result = await res.json()
      if (result.success) setContracts(result.contracts)
    } catch (err) {
      console.error('Failed to load contracts:', err)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!formData.productId) {
      setFormError('Please select a product')
      return
    }

    const res = await fetch('/api/admin/contract-pricing', {
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

    const result = await res.json()

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
      setFormError(result.error || 'Error saving contract')
    }
  }

  async function handleDelete(contractId: string) {
    if (!confirm('Delete this contract price?')) return
    const res = await fetch(`/api/admin/contract-pricing?id=${contractId}`, {
      method: 'DELETE'
    })
    const result = await res.json()
    if (result.success) loadContracts(selectedCustomer)
  }

  // ── Clone handler ────────────────────────────────────────────────
  function openCloneModal() {
    setSourceCustomerId('')
    setSourceContracts([])
    setCloneMode('merge')
    setCloneMessage(null)
    setShowCloneModal(true)
  }

  async function handleClone() {
    if (!sourceCustomerId || !selectedCustomer) return
    if (sourceCustomerId === selectedCustomer) {
      setCloneMessage({ type: 'error', text: 'Source and target customers are the same' })
      return
    }
    if (sourceContracts.length === 0) {
      setCloneMessage({ type: 'error', text: 'Source customer has no contract prices' })
      return
    }

    const confirmMsg = cloneMode === 'replace'
      ? `⚠️ REPLACE ALL contract prices?\n\nThis will DELETE ${contracts.length} existing contract price(s) and copy ${sourceContracts.length} from the source customer.\n\nContinue?`
      : `Clone ${sourceContracts.length} contract prices (merge mode)?\n\nOnly products not already in the current contracts will be added.\n${contracts.length} existing prices will be kept.\n\nContinue?`

    if (!confirm(confirmMsg)) return

    setCloning(true)
    setCloneMessage(null)

    try {
      const res = await fetch('/api/admin/contract-pricing/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCustomerId,
          targetCustomerId: selectedCustomer,
          mode: cloneMode,
        }),
      })

      const result = await res.json()

      if (result.success) {
        setCloneMessage({
          type: 'success',
          text: `✅ Cloned ${result.added} price${result.added !== 1 ? 's' : ''}${result.skipped > 0 ? `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}` : ''}${result.replaced > 0 ? `, replaced ${result.replaced}` : ''}`,
        })
        loadContracts(selectedCustomer)
        setTimeout(() => setShowCloneModal(false), 1800)
      } else {
        setCloneMessage({ type: 'error', text: result.error || 'Clone failed' })
      }
    } catch (err: any) {
      setCloneMessage({ type: 'error', text: err.message })
    } finally {
      setCloning(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount)

  // Source customer options for clone modal (exclude current customer)
  const sourceCustomerOptions = customers
    .filter(c => c.id !== selectedCustomer)
    .sort((a, b) => (a.business_name || a.email).localeCompare(b.business_name || b.email))

  const selectedCustomerName =
    customers.find(c => c.id === selectedCustomer)?.business_name ||
    customers.find(c => c.id === selectedCustomer)?.email ||
    'Customer'

  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    badge: p.code || '—',
    sublabel: formatCurrency(p.price),
  }))

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>

  return (
    <div className="p-8">

      {/* ══════════ CLONE MODAL ══════════ */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
                <Copy className="h-5 w-5" />
                Clone Contract Pricing
              </h2>
              <button onClick={() => setShowCloneModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">

              {/* Source customer */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Copy <span className="text-green-700">FROM</span>:
                </label>
                <select
                  value={sourceCustomerId}
                  onChange={e => setSourceCustomerId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— Select source customer —</option>
                  {sourceCustomerOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.business_name || c.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target customer (read-only display) */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Copy <span className="text-red-600">TO</span>:
                </label>
                <div className="px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-md text-gray-700">
                  {selectedCustomerName}
                </div>
              </div>

              {/* Source preview */}
              {sourceCustomerId && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  {sourceContracts.length === 0 ? (
                    <p className="text-sm text-blue-700">
                      Source customer has <strong>no contract prices</strong> to clone.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-blue-900 mb-2">
                        📋 Source has {sourceContracts.length} contract price{sourceContracts.length !== 1 ? 's' : ''}
                      </p>
                      <div className="max-h-40 overflow-y-auto text-xs text-blue-700 space-y-1">
                        {sourceContracts.slice(0, 20).map(c => (
                          <div key={c.id} className="flex justify-between">
                            <span className="truncate">
                              <span className="font-mono text-gray-500">{c.product_number}</span>{' '}
                              {c.product_name}
                            </span>
                            <span className="font-bold font-mono ml-2 shrink-0">
                              {formatCurrency(c.contract_price)}
                            </span>
                          </div>
                        ))}
                        {sourceContracts.length > 20 && (
                          <p className="text-xs italic text-blue-500 pt-1">
                            ...and {sourceContracts.length - 20} more
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Mode selection */}
              {sourceContracts.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold mb-2">Clone Mode</label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors"
                      style={{
                        borderColor: cloneMode === 'merge' ? '#006A4E' : '#e5e7eb',
                        backgroundColor: cloneMode === 'merge' ? '#f0fdf4' : 'white',
                      }}>
                      <input
                        type="radio"
                        checked={cloneMode === 'merge'}
                        onChange={() => setCloneMode('merge')}
                        className="mt-0.5 accent-green-600"
                      />
                      <div>
                        <p className="font-semibold text-sm">
                          🟢 Merge <span className="text-xs font-normal text-gray-500">(safe)</span>
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Only add prices for products <strong>not already</strong> in current contracts.
                          Keep existing prices unchanged.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors"
                      style={{
                        borderColor: cloneMode === 'replace' ? '#CE1126' : '#e5e7eb',
                        backgroundColor: cloneMode === 'replace' ? '#fef2f2' : 'white',
                      }}>
                      <input
                        type="radio"
                        checked={cloneMode === 'replace'}
                        onChange={() => setCloneMode('replace')}
                        className="mt-0.5 accent-red-600"
                      />
                      <div>
                        <p className="font-semibold text-sm">
                          🔴 Replace All <span className="text-xs font-normal text-gray-500">(destructive)</span>
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          <strong>Delete</strong> all {contracts.length} existing contract price(s),
                          then copy exactly from source.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Message */}
              {cloneMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  cloneMessage.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {cloneMessage.text}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  onClick={() => setShowCloneModal(false)}
                  disabled={cloning}
                  className="px-5 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClone}
                  disabled={cloning || !sourceCustomerId || sourceContracts.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: cloneMode === 'replace' ? '#CE1126' : '#006A4E' }}
                >
                  {cloning ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Cloning...</>
                  ) : (
                    <><Copy className="h-4 w-4" /> Clone {sourceContracts.length} Price{sourceContracts.length !== 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ HEADER ══════════ */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold flex items-center gap-2"
          style={{ color: '#006A4E' }}
        >
          <DollarSign className="h-8 w-8" />
          Contract Pricing
        </h1>
        <p className="text-gray-600 mt-2">Manage customer-specific pricing</p>
      </div>

      {/* ══════════ CUSTOMER SELECTOR ══════════ */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <label className="block text-sm font-medium mb-2">Select Customer</label>
        <select
          value={selectedCustomer}
          onChange={(e) => {
            setSelectedCustomer(e.target.value)
            setContracts([])
            setShowForm(false)
          }}
          className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
        >
          <option value="">-- Choose a customer --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.business_name || c.email}
            </option>
          ))}
        </select>
      </div>

      {/* ══════════ CONTRACTS SECTION ══════════ */}
      {selectedCustomer && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold">Active Contract Prices</h2>
            <div className="flex gap-2">
              <button
                onClick={openCloneModal}
                className="flex items-center gap-2 px-4 py-2 rounded border-2 border-blue-600 text-blue-600 font-medium hover:bg-blue-50 transition-colors"
              >
                <Copy className="h-4 w-4" />
                Clone from Customer
              </button>
              <button
                onClick={() => { setShowForm(!showForm); setFormError('') }}
                className="flex items-center gap-2 px-4 py-2 rounded text-white hover:opacity-90"
                style={{ backgroundColor: '#006A4E' }}
              >
                <Plus className="h-4 w-4" />
                Add Contract Price
              </button>
            </div>
          </div>

          {/* Add Form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-6 p-4 border rounded-lg bg-gray-50 space-y-4"
            >
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SearchableSelect
                    label="Product"
                    options={productOptions}
                    value={formData.productId}
                    onChange={(value) =>
                      setFormData({ ...formData, productId: value })
                    }
                    placeholder="Search by code or name..."
                    grouped={true}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Contract Price <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500 font-medium">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.contractPrice}
                      onChange={(e) =>
                        setFormData({ ...formData, contractPrice: e.target.value })
                      }
                      required
                      className="w-full pl-7 pr-3 py-2 border rounded focus:ring-2 focus:ring-green-500"
                      placeholder="5.50"
                    />
                  </div>
                  {formData.productId && (() => {
                    const p = products.find(p => p.id === formData.productId)
                    return p ? (
                      <p className="text-xs text-gray-400 mt-1">
                        Standard price: {formatCurrency(p.price)}
                      </p>
                    ) : null
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Effective From <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.effectiveFrom}
                    onChange={(e) =>
                      setFormData({ ...formData, effectiveFrom: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Effective To
                    <span className="text-gray-400 font-normal ml-1">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={formData.effectiveTo}
                    onChange={(e) =>
                      setFormData({ ...formData, effectiveTo: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="submit"
                  className="px-5 py-2 rounded text-white font-medium hover:opacity-90"
                  style={{ backgroundColor: '#006A4E' }}
                >
                  Save Contract Price
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError('') }}
                  className="px-5 py-2 rounded border hover:bg-gray-100"
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
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Product</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">Standard</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">Contract</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">Saving</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">From</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">To</th>
                  <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Del</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No contract prices set for this customer
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => {
                    const savings = contract.standard_price - contract.contract_price
                    const savingsPct = ((savings / contract.standard_price) * 100).toFixed(1)
                    return (
                      <tr key={contract.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="font-medium text-sm">{contract.product_name}</div>
                          <div className="text-xs text-gray-400 font-mono">
                            {contract.product_number}
                          </div>
                        </td>
                        <td className="text-right py-2 px-3 text-sm">
                          {formatCurrency(contract.standard_price)}
                        </td>
                        <td
                          className="text-right py-2 px-3 font-bold text-sm"
                          style={{ color: '#006A4E' }}
                        >
                          {formatCurrency(contract.contract_price)}
                        </td>
                        <td className="text-right py-2 px-3 text-sm text-green-600">
                          -{formatCurrency(savings)} ({savingsPct}%)
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {new Date(contract.effective_from).toLocaleDateString('en-AU')}
                        </td>
                        <td className="py-2 px-3 text-sm text-gray-500">
                          {contract.effective_to
                            ? new Date(contract.effective_to).toLocaleDateString('en-AU')
                            : 'Ongoing'}
                        </td>
                        <td className="text-center py-2 px-3">
                          <button
                            onClick={() => handleDelete(contract.id)}
                            className="text-red-500 hover:text-red-700 transition-colors"
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
      )}
    </div>
  )
}