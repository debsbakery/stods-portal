'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Minus, X, ArrowLeft, Save } from 'lucide-react'
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select'

export default function AdminOrderEditView({ order, products }: any) {
  const router = useRouter()

  const [items,               setItems]               = useState<any[]>(order.order_items || [])
  const [saving,              setSaving]              = useState(false)
  const [selectedProductId,   setSelectedProductId]   = useState('')
  const [selectedQty,         setSelectedQty]         = useState(1)
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(order.purchase_order_number || '')
  const [docketNumber,        setDocketNumber]        = useState(order.docket_number || '')

  // ── Build product options for SearchableSelect ─────────────────────────────
  // badge = product_number (numeric) so grouping works: Cakes/Bread/Rolls/Pies/Other
  const productOptions: SelectOption[] = products.map((p: any) => ({
    value:    p.id,
    label:    p.name,
    sublabel: `$${Number(p.price).toFixed(2)}${p.unit ? ' / ' + p.unit : ''}`,
    badge:    String(p.product_number ?? p.product_code ?? ''),
  }))

  // ── Totals ────────────────────────────────────────────────────────────────
  function calculateTotals() {
    const subtotal = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.unit_price, 0
    )
    const gst = items.reduce(
      (sum: number, item: any) =>
        sum + (item.gst_applicable ? item.quantity * item.unit_price * 0.1 : 0),
      0
    )
    return { subtotal, gst, total: subtotal + gst }
  }

  // ── Item management ───────────────────────────────────────────────────────
  function updateQuantity(itemId: string, newQty: number) {
    if (newQty <= 0) {
      setItems((prev) => prev.filter((i: any) => i.id !== itemId))
    } else {
      setItems((prev) =>
        prev.map((i: any) => (i.id === itemId ? { ...i, quantity: newQty } : i))
      )
    }
  }

  function addProduct() {
    if (!selectedProductId) return

    const product = products.find((p: any) => p.id === selectedProductId)
    if (!product) return

    const qty = Math.max(1, selectedQty)

    // If product already in list — just increase quantity
    const existing = items.find(
      (i: any) => (i.product?.id || i.product_id) === selectedProductId
    )

    if (existing) {
      updateQuantity(existing.id, existing.quantity + qty)
    } else {
      setItems((prev) => [
        ...prev,
        {
          id:           `new-${Date.now()}`,
          product_id:   product.id,
          product_name: product.name,
          product:      product,
          quantity:     qty,
          unit_price:   Number(product.price),
          gst_applicable: product.gst_applicable ?? false,
          subtotal:     Number(product.price) * qty,
        },
      ])
    }

    // Reset picker
    setSelectedProductId('')
    setSelectedQty(1)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveChanges() {
    if (items.length === 0) {
      alert('Order must have at least one item')
      return
    }

    setSaving(true)
    const { total } = calculateTotals()

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item: any) => ({
            product_id:    item.product?.id || item.product_id,
            product_name:  item.product?.name || item.product_name,
            quantity:      item.quantity,
            unit_price:    item.unit_price,
            gst_applicable: item.gst_applicable,
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
        alert(`Failed to save: ${err.error ?? 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('Error saving order — check console')
    } finally {
      setSaving(false)
    }
  }

  const { subtotal, gst, total } = calculateTotals()

  return (
    <div className="max-w-5xl mx-auto p-6">

      {/* Back */}
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Edit Order #{String(order.invoice_number ?? '').padStart(6, '0') || order.id.slice(0, 8).toUpperCase()}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {order.customer_business_name} &mdash; Delivery: {
            new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })
          }
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* PO / Docket */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order References</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Order Number <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-2024-1234"
                  value={purchaseOrderNumber}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Docket Number <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. DOC-5678"
                  value={docketNumber}
                  onChange={(e) => setDocketNumber(e.target.value)}
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
                {items.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:border-gray-300 transition-colors"
                  >
                    {/* Product code badge */}
                    {(item.product?.product_number || item.product?.product_code) && (
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 shrink-0">
                        {item.product.product_number ?? item.product.product_code}
                      </span>
                    )}

                    {/* Name + price */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {item.product?.name || item.product_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        ${Number(item.unit_price).toFixed(2)} each
                        {item.gst_applicable && (
                          <span className="ml-1 text-green-600">+ GST</span>
                        )}
                      </p>
                    </div>

                    {/* Qty controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                        className="w-12 text-center border rounded text-sm font-semibold py-0.5"
                      />
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 flex items-center justify-center"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Line total */}
                    <div className="w-20 text-right text-sm font-semibold shrink-0">
                      ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => updateQuantity(item.id, 0)}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add product — SearchableSelect */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add Product</h2>

            <div className="flex gap-3 items-end">
              {/* Product picker — grouped by category, searchable */}
              <div className="flex-1">
                <SearchableSelect
                  label="Search products"
                  options={productOptions}
                  value={selectedProductId}
                  onChange={(val) => setSelectedProductId(val)}
                  placeholder="Type product name or code..."
                  grouped={true}
                />
              </div>

              {/* Quantity */}
              <div className="w-24">
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Add button */}
              <button
                onClick={addProduct}
                disabled={!selectedProductId}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium
                           hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400
                           disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            {/* Preview selected product */}
            {selectedProductId && (() => {
              const p = products.find((x: any) => x.id === selectedProductId)
              return p ? (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <span className="font-medium text-green-800">{p.name}</span>
                  <span className="text-green-600 ml-2">${Number(p.price).toFixed(2)} each</span>
                  <span className="text-green-600 ml-2">
                    — adding {selectedQty} = <strong>${(Number(p.price) * selectedQty).toFixed(2)}</strong>
                  </span>
                </div>
              ) : null
            })()}
          </div>
        </div>

        {/* ── Right column — totals + save ── */}
        <div className="space-y-4">
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
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg
                           font-semibold disabled:bg-gray-200 disabled:text-gray-400
                           disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                onClick={() => router.push('/admin')}
                className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600
                           hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Order meta info */}
            <div className="mt-4 pt-4 border-t text-xs text-gray-400 space-y-1">
              <p>Status: <span className="font-medium text-gray-600">{order.status}</span></p>
              <p>Created: {new Date(order.created_at).toLocaleDateString('en-AU')}</p>
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