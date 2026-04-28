'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Minus, X, ArrowLeft, Save } from 'lucide-react'
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select'

const CUSTOM_CODE = '900'

export default function AdminOrderEditView({ order, products }: any) {
  const router = useRouter()
  const [mounted, setMounted]                       = useState(false)
  const [items, setItems]                           = useState<any[]>(order.order_items || [])
  const [saving, setSaving]                         = useState(false)
  const [selectedProductId, setSelectedProductId]   = useState('')
  const [selectedQty, setSelectedQty]               = useState(1)
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(order.purchase_order_number || '')
  const [docketNumber, setDocketNumber]             = useState(order.docket_number || '')
  const [contractPrices, setContractPrices]         = useState<Record<string, number>>({})

  useEffect(() => { setMounted(true) }, [])

  // Load contract pricing
  useEffect(() => {
    if (!order.customer_id) return
    fetch(`/api/customers/${order.customer_id}/pricing`)
      .then(r => r.ok ? r.json() : { pricing: [] })
      .then(data => {
        const map: Record<string, number> = {}
        ;(data.pricing ?? []).forEach((p: any) => { map[p.product_id] = p.price })
        setContractPrices(map)
      })
      .catch(() => setContractPrices({}))
  }, [order.customer_id])

  function resolveProductId(item: any): string {
    return item.product_id ?? item.products?.id ?? item.product?.id ?? ''
  }

  function resolveItemPrice(item: any): number {
  if (item.unit_price != null) return Number(item.unit_price)
  return Number(item.products?.price ?? item.product?.price ?? 0)
}

  function resolveProductCode(item: any): string {
    return String(
      item.products?.code ?? item.product?.code ?? ''
    )
  }

  function isCustomItem(item: any): boolean {
    return resolveProductCode(item) === CUSTOM_CODE
  }

  function priceForProduct(productId: string): number {
    if (contractPrices[productId] !== undefined) return contractPrices[productId]
    const p = products.find((x: any) => x.id === productId)
    return p?.price ?? 0
  }

  const productOptions: SelectOption[] = products.map((p: any) => ({
    value:    p.id,
    label:    p.name,
    badge:    String(p.code ?? ''),
    sublabel: String(p.code) === CUSTOM_CODE
      ? 'Custom description + price'
      : `$${(contractPrices[p.id] ?? p.price ?? 0).toFixed(2)}${
          contractPrices[p.id] !== undefined ? ' (contract)' : ''
        }`,
  }))

  function calculateTotals() {
    const subtotal = items.reduce(
      (sum: number, item: any) => sum + item.quantity * resolveItemPrice(item), 0
    )
    const gst = items.reduce(
      (sum: number, item: any) =>
        sum + (item.gst_applicable ? item.quantity * resolveItemPrice(item) * 0.1 : 0),
      0
    )
    return { subtotal, gst, total: subtotal + gst }
  }

  function updateQuantity(itemId: string, newQty: number) {
    if (newQty <= 0) {
      setItems(prev => prev.filter((i: any) => i.id !== itemId))
    } else {
      setItems(prev =>
        prev.map((i: any) => i.id === itemId ? { ...i, quantity: newQty } : i)
      )
    }
  }

  function updateItemField(itemId: string, field: string, value: any) {
    setItems(prev =>
      prev.map((i: any) => i.id === itemId ? { ...i, [field]: value } : i)
    )
  }

  function addProduct() {
    if (!selectedProductId) return
    const product = products.find((p: any) => p.id === selectedProductId)
    if (!product) return

    const qty      = Math.max(1, selectedQty)
    const price    = priceForProduct(selectedProductId)
    const isCustom = String(product.code) === CUSTOM_CODE

    const existing = items.find((i: any) => resolveProductId(i) === selectedProductId)

    if (existing && !isCustom) {
      updateQuantity(existing.id, existing.quantity + qty)
    } else {
      setItems(prev => [
        ...prev,
        {
          id:                 `new-${Date.now()}`,
          product_id:         product.id,
          product_name:       product.name,
          products:           product,
          quantity:           qty,
          unit_price:         isCustom ? 0 : price,
          gst_applicable:     isCustom ? false : (product.gst_applicable ?? false),
          custom_description: '',
          isCustomItem:       isCustom,
        },
      ])
    }

    setSelectedProductId('')
    setSelectedQty(1)
  }

  async function saveChanges() {
    if (items.length === 0) {
      alert('Order must have at least one item')
      return
    }

    // Validate custom items
    for (const item of items) {
      if (isCustomItem(item)) {
        const desc = item.custom_description || ''
        if (!desc.trim()) {
          alert('Custom item (code 900) requires a description')
          return
        }
        if (resolveItemPrice(item) <= 0) {
          alert('Custom item (code 900) requires a price greater than $0')
          return
        }
      }
    }

    setSaving(true)
    const { total } = calculateTotals()

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item: any) => ({
            product_id:         resolveProductId(item),
            product_name:       item.products?.name ?? item.product?.name ?? item.product_name,
            quantity:           item.quantity,
            unit_price:         resolveItemPrice(item),
            gst_applicable:     item.gst_applicable,
            custom_description: isCustomItem(item)
              ? (item.custom_description || '').trim()
              : null,
          })),
          total_amount:          total,
          purchase_order_number: purchaseOrderNumber || null,
          docket_number:         docketNumber || null,
        }),
      })

      if (response.ok) {
        router.push('/admin?success=order-updated')
      } else {
        const err = await response.json()
        alert('Failed to save: ' + (err.error ?? 'Unknown error'))
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Error saving order')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-100 rounded w-1/2"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  const { subtotal, gst, total } = calculateTotals()

  const orderTitle = order.invoice_number
    ? 'Edit Order #' + String(order.invoice_number).padStart(6, '0')
    : 'Edit Order #' + order.id.slice(0, 8).toUpperCase()

  const deliveryDisplay = order.delivery_date
    ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{orderTitle}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {order.customer_business_name} &mdash; Delivery: {deliveryDisplay}
        </p>
        {Object.keys(contractPrices).length > 0 && (
          <p className="text-blue-600 text-sm mt-1 font-medium">
            Contract pricing active ({Object.keys(contractPrices).length} products)
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">

          {/* PO / Docket */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order References</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Order Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-2024-1234"
                  value={purchaseOrderNumber}
                  onChange={e => setPurchaseOrderNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Docket Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. DOC-5678"
                  value={docketNumber}
                  onChange={e => setDocketNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Current items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              Order Items
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({items.length} line{items.length !== 1 ? 's' : ''})
              </span>
            </h2>

            {items.length === 0 ? (
              <p className="text-center py-8 text-gray-400">No items — add products below</p>
            ) : (
              <div className="space-y-2">
                {items.map((item: any) => {
                  const resolvedId  = resolveProductId(item)
                  const productCode = resolveProductCode(item)
                  const productName = item.products?.name ?? item.product?.name ?? item.product_name ?? ''
                  const unitPrice   = resolveItemPrice(item)
                  const isContract  = contractPrices[resolvedId] !== undefined
                  const custom      = isCustomItem(item)

                  return (
                    <div key={item.id} className="space-y-1">

                      {/* Main item row */}
                      <div className="flex items-center gap-3 p-3 border rounded-lg hover:border-gray-300 transition-colors">

                        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 shrink-0 min-w-[3rem] text-center">
                          {productCode || '-'}
                        </span>

                        <div className="flex-1 min-w-0">
                          {custom ? (
                            // Custom item — show price input inline
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-amber-600 shrink-0">
                                Custom:
                              </span>
                              <input
                                type="number"
                                min="0.0"
                                step="0.01"
                                value={unitPrice || ''}
                                onChange={e =>
                                  updateItemField(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                                }
                                placeholder="Price $"
                                className="w-24 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                              <input
                                type="checkbox"
                                checked={item.gst_applicable ?? false}
                                onChange={e =>
                                  updateItemField(item.id, 'gst_applicable', e.target.checked)
                                }
                                className="w-3.5 h-3.5 accent-green-600"
                                title="GST applicable"
                              />
                              <span className="text-xs text-gray-400">GST</span>
                            </div>
                          ) : (
                            <p className="font-medium text-sm truncate">{productName}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            ${unitPrice.toFixed(2)} each
                            {item.gst_applicable && (
                              <span className="ml-1 text-green-600">+ GST</span>
                            )}
                            {isContract && (
                              <span className="ml-1 text-blue-600 font-medium">Contract</span>
                            )}
                          </p>
                        </div>

                        {/* Qty controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                            className="w-12 text-center border rounded text-sm font-semibold py-0.5"
                          />
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="w-20 text-right text-sm font-semibold shrink-0">
                          ${(item.quantity * unitPrice).toFixed(2)}
                        </div>

                        <button
                          onClick={() => updateQuantity(item.id, 0)}
                          className="text-red-400 hover:text-red-600 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Custom description row — only for code 900 */}
                      {custom && (
                        <div className="ml-2 mr-8">
                          <input
                            type="text"
                            value={item.custom_description || ''}
                            onChange={e =>
                              updateItemField(item.id, 'custom_description', e.target.value)
                            }
                            placeholder="Description e.g. Birthday Cake - 2 tier chocolate"
                            className="w-full border border-amber-400 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                          />
                          {!(item.custom_description || '').trim() && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              Description required for custom items
                            </p>
                          )}
                        </div>
                      )}

                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add product */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add Product</h2>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <SearchableSelect
                  label="Search products"
                  options={productOptions}
                  value={selectedProductId}
                  onChange={val => setSelectedProductId(val)}
                  placeholder="Type product name or code..."
                  grouped={true}
                />
              </div>

              <div className="w-24">
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={selectedQty}
                  onChange={e => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <button
                onClick={addProduct}
                disabled={!selectedProductId}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>

            {selectedProductId && (() => {
              const p = products.find((x: any) => x.id === selectedProductId)
              if (!p) return null
              const price    = priceForProduct(p.id)
              const isCustom = String(p.code) === CUSTOM_CODE
              return (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <span className="font-medium text-green-800">{p.name}</span>
                  {isCustom ? (
                    <span className="text-amber-600 ml-2">
                      Enter description + price after adding
                    </span>
                  ) : (
                    <>
                      <span className="text-green-600 ml-2">${price.toFixed(2)} each</span>
                      {contractPrices[p.id] !== undefined && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                          Contract price
                        </span>
                      )}
                      <span className="text-green-600 ml-2">
                        - {selectedQty} = <strong>${(price * selectedQty).toFixed(2)}</strong>
                      </span>
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Right column — summary */}
        <div>
          <div className="bg-white rounded-lg shadow p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST (10%)</span>
                <span>${gst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                <span>Total</span>
                <span className="text-green-600">${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={saveChanges}
                disabled={saving || items.length === 0}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                onClick={() => router.push('/admin')}
                className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 pt-4 border-t text-xs text-gray-400 space-y-1">
              <p>Status: <span className="font-medium text-gray-600">{order.status}</span></p>
              {order.invoice_number && (
                <p>Invoice #: <span className="font-medium">{String(order.invoice_number).padStart(6, '0')}</span></p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}