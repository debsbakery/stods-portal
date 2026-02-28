'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ArrowLeft, ClipboardList } from 'lucide-react'
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  business_name: string
  email: string
  address: string
  abn: string
  payment_terms: number
  balance: number
}

interface Product {
  id: string
  name: string
  product_number: number   // ← correct DB column name
  price: number
  unit_price: number
  gst_applicable: boolean
  is_available: boolean
}

interface LineItem {
  id: string
  productId: string
  productName: string
  productNumber: string
  quantity: number
  unitPrice: number
  gstApplicable: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminCreateOrderPage() {
  const supabase = createClient()

  const [customers,        setCustomers]       = useState<Customer[]>([])
  const [products,         setProducts]        = useState<Product[]>([])
  const [lineItems,        setLineItems]       = useState<LineItem[]>([])
  const [loading,          setLoading]         = useState(false)
  const [error,            setError]           = useState<string | null>(null)
  const [success,          setSuccess]         = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [contractPrices,   setContractPrices]  = useState<Record<string, number>>({})

  const [form, setForm] = useState({
    customerId:          '',
    deliveryDate:        '',
    purchaseOrderNumber: '',
    docketNumber:        '',
    notes:               '',
    source:              'phone',
  })

  // ── Load customers + products ────────────────────────────────────────────
  useEffect(() => {
    // Customers — try both status columns
    supabase
      .from('customers')
      .select('*')
      .order('business_name')
      .then(({ data }) => { if (data) setCustomers(data) })

    // Products — use correct column name
    supabase
      .from('products')
      .select('id, name, product_number, price, unit_price, gst_applicable, is_available')
      .eq('is_available', true)
      .order('product_number')
      .then(({ data }) => { if (data) setProducts(data) })
  }, [])

  // ── Load contract pricing when customer changes ──────────────────────────
  useEffect(() => {
    if (!form.customerId) {
      setContractPrices({})
      return
    }
    fetch(`/api/customers/${form.customerId}/pricing`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.pricing) {
          const map: Record<string, number> = {}
          data.pricing.forEach((p: any) => { map[p.product_id] = p.price })
          setContractPrices(map)
        }
      })
      .catch(() => setContractPrices({}))
  }, [form.customerId])

  function priceFor(product: Product): number {
    return contractPrices[product.id] ?? product.unit_price ?? product.price ?? 0
  }

  // ── Select options ───────────────────────────────────────────────────────
  const customerOptions: SelectOption[] = customers.map((c) => ({
    value:    c.id,
    label:    c.business_name || c.email,
    sublabel: `Balance: ${fmt(c.balance || 0)} | ${c.payment_terms || 30} day terms`,
  }))

  // ✅ badge = product_number (numeric string) so grouping works
  const productOptions: SelectOption[] = products.map((p) => ({
    value:    p.id,
    label:    p.name,
    badge:    String(p.product_number ?? ''),
    sublabel: `${fmt(priceFor(p))}${p.gst_applicable ? ' + GST' : ' no GST'}`,
  }))

  // ── Customer change ──────────────────────────────────────────────────────
  function handleCustomerChange(id: string) {
    const c = customers.find((c) => c.id === id) || null
    setSelectedCustomer(c)
    setForm((f) => ({ ...f, customerId: id }))

    // Update prices on existing line items when customer changes
    if (c) {
      setLineItems((prev) =>
        prev.map((item) => {
          const product = products.find((p) => p.id === item.productId)
          if (!product) return item
          return {
            ...item,
            unitPrice: contractPrices[item.productId] ?? product.unit_price ?? product.price ?? 0,
          }
        })
      )
    }
  }

  // ── Line item management ─────────────────────────────────────────────────
  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id:            Math.random().toString(36).slice(2),
        productId:     '',
        productName:   '',
        productNumber: '',
        quantity:      1,
        unitPrice:     0,
        gstApplicable: false,
      },
    ])
  }

  function updateLineItem(id: string, field: string, value: any) {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item

        if (field === 'productId') {
          if (!value) {
            return {
              ...item,
              productId:     '',
              productName:   '',
              productNumber: '',
              unitPrice:     0,
              gstApplicable: false,
            }
          }
          const p = products.find((p) => p.id === value)
          if (!p) return item
          return {
            ...item,
            productId:     p.id,
            productName:   p.name,
            productNumber: String(p.product_number ?? ''),
            unitPrice:     priceFor(p),
            gstApplicable: p.gst_applicable ?? false,
          }
        }

        return { ...item, [field]: value }
      })
    )
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const subtotal   = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const gstTotal   = lineItems.reduce(
    (s, i) => s + (i.gstApplicable ? i.quantity * i.unitPrice * 0.1 : 0), 0
  )
  const grandTotal = subtotal + gstTotal

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (!form.customerId)  throw new Error('Please select a customer')
      if (!form.deliveryDate) throw new Error('Please select a delivery date')
      if (!lineItems.length) throw new Error('Please add at least one product')
      if (lineItems.some((i) => !i.productId || i.quantity <= 0))
        throw new Error('Please complete all line items — every row needs a product and quantity')

      const customer = selectedCustomer!

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id:            form.customerId,
          customer_email:         customer.email,
          customer_business_name: customer.business_name,
          customer_address:       customer.address || null,
          customer_abn:           customer.abn     || null,
          delivery_date:          form.deliveryDate,
          total_amount:           grandTotal,
          status:                 'pending',
          source:                 form.source,
          notes:                  form.notes               || null,
          purchase_order_number:  form.purchaseOrderNumber || null,
          docket_number:          form.docketNumber        || null,
        })
        .select()
        .single()

      if (orderError) throw new Error(`Order failed: ${orderError.message}`)

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(
          lineItems.map((item) => ({
            order_id:      newOrder.id,
            product_id:    item.productId,
            product_name:  item.productName,
            quantity:      item.quantity,
            unit_price:    item.unitPrice,
            subtotal:      item.quantity * item.unitPrice,
            gst_applicable: item.gstApplicable,
          }))
        )

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', newOrder.id)
        throw new Error(`Items failed: ${itemsError.message}`)
      }

      setSuccess(
        `Order created for ${customer.business_name} — delivery ${
          new Date(form.deliveryDate + 'T00:00:00').toLocaleDateString('en-AU', {
            weekday: 'long', day: 'numeric', month: 'long',
          })
        }. Total: ${fmt(grandTotal)}`
      )

      // Reset form
      setLineItems([])
      setSelectedCustomer(null)
      setForm((f) => ({
        ...f,
        customerId:          '',
        purchaseOrderNumber: '',
        docketNumber:        '',
        notes:               '',
        deliveryDate:        '',
      }))

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">

        <a
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: '#CE1126' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </a>

        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
            <ClipboardList className="h-8 w-8" /> Create Order
          </h1>
          <p className="text-gray-600 mt-1">
            Enter phone, email or walk-in orders
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
            <div className="mt-2 flex gap-4">
              <a href="/admin/production" className="underline font-medium">Go to Production</a>
              <a href="/admin/orders/create" className="underline font-medium">Create Another Order</a>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Order details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-bold text-lg mb-4">Order Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Customer — full width */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={customerOptions}
                  value={form.customerId}
                  onChange={handleCustomerChange}
                  placeholder="Search customer name..."
                />
                {selectedCustomer && (
                  <p className="text-xs text-gray-500 mt-1">
                    Balance:{' '}
                    <span className={selectedCustomer.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                      {fmt(selectedCustomer.balance || 0)}
                    </span>
                    {' | '}{selectedCustomer.payment_terms || 30} day terms
                    {Object.keys(contractPrices).length > 0 && (
                      <span className="ml-2 text-blue-600 font-medium">
                        Contract pricing active ({Object.keys(contractPrices).length} products)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Delivery date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.deliveryDate}
                  required
                  onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Order source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Source</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                >
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="fax">Fax</option>
                  <option value="walkin">Walk-in</option>
                  <option value="online">Online</option>
                </select>
              </div>

              {/* PO number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
                <input
                  type="text"
                  value={form.purchaseOrderNumber}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseOrderNumber: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                  placeholder="Optional"
                />
              </div>

              {/* Docket */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Docket Number</label>
                <input
                  type="text"
                  value={form.docketNumber}
                  onChange={(e) => setForm((f) => ({ ...f, docketNumber: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                  placeholder="Optional"
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500 resize-none"
                  rows={2}
                  placeholder="Special instructions, delivery notes..."
                />
              </div>

            </div>
          </div>

          {/* Products */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">
                Products
                {lineItems.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({lineItems.length} line{lineItems.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#006A4E' }}
              >
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
                Click <strong>Add Product</strong> to start the order
              </div>
            ) : (
              <div className="space-y-2">

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 pb-1 border-b px-1">
                  <span className="col-span-5">Product</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-2 text-center">Unit $</span>
                  <span className="col-span-1 text-center">GST</span>
                  <span className="col-span-1 text-right">Total</span>
                  <span className="col-span-1"></span>
                </div>

                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg"
                  >
                    {/* Product searchable select — grouped by category */}
                    <div className="col-span-5">
                      <SearchableSelect
                        options={productOptions}
                        value={item.productId}
                        onChange={(val) => updateLineItem(item.id, 'productId', val)}
                        placeholder="Select product..."
                        grouped={true}
                      />
                    </div>

                    {/* Quantity */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={item.quantity}
                        onChange={(e) =>
                          updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 1)
                        }
                        className="w-full border rounded px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>

                    {/* Unit price — editable to override */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)
                        }
                        className="w-full border rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>

                    {/* GST checkbox */}
                    <div className="col-span-1 flex justify-center">
                      <input
                        type="checkbox"
                        checked={item.gstApplicable}
                        onChange={(e) =>
                          updateLineItem(item.id, 'gstApplicable', e.target.checked)
                        }
                        className="w-4 h-4 accent-green-600"
                      />
                    </div>

                    {/* Line total — subtotal only (ex GST) */}
                    <div className="col-span-1 text-right text-sm font-mono font-semibold">
                      {fmt(item.quantity * item.unitPrice)}
                    </div>

                    {/* Remove */}
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div className="border-t pt-3 mt-2 space-y-1 text-right">
                  <div className="text-sm text-gray-600">
                    Subtotal (ex GST):{' '}
                    <span className="font-mono font-medium ml-2">{fmt(subtotal)}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    GST (10%):{' '}
                    <span className="font-mono font-medium ml-2">{fmt(gstTotal)}</span>
                  </div>
                  <div className="text-xl font-bold mt-1" style={{ color: '#006A4E' }}>
                    Total (inc GST): {fmt(grandTotal)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-3 pb-8">
            <button
              type="submit"
              disabled={loading || !lineItems.length || !form.customerId || !form.deliveryDate}
              className="flex-1 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: '#006A4E' }}
            >
              {loading ? 'Creating Order...' : 'Create Order'}
            </button>
            <a
              href="/admin"
              className="px-6 py-3 rounded-md border border-gray-300 hover:bg-gray-50 text-sm font-medium text-center transition-colors"
            >
              Cancel
            </a>
          </div>

        </form>
      </div>
    </div>
  )
}