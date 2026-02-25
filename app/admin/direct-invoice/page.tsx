'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, FileText, DollarSign, ArrowLeft, MinusCircle } from 'lucide-react'

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
  product_number: string
  name: string
  price: number
  unit_price: number
  gst_applicable: boolean
  product_code: number
  code: string
}

interface LineItem {
  id: string
  productId: string
  productName: string
  productCode: string
  quantity: number
  unitPrice: number
  gstApplicable: boolean
  isCredit: boolean
  creditPercent: number
  creditType: 'product_credit' | 'stale_return'
  isCustom: boolean
}

const CREDIT_PERCENTS = [100, 75, 50, 25]

export default function DirectInvoicePage() {
  const [customers, setCustomers]= useState<Customer[]>([])
  const [products, setProducts]                 = useState<Product[]>([])
  const [lineItems, setLineItems]               = useState<LineItem[]>([])
  const [loading, setLoading]                   = useState(false)
  const [error, setError]                       = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    customerId:          '',
    deliveryDate:        new Date().toISOString().split('T')[0],
    purchaseOrderNumber: '',
    docketNumber:        '',
    notes:               '',
  })

  const supabase = createClient()

  useEffect(() => {
    supabase.from('customers').select('*').order('business_name')
      .then(({ data }) => { if (data) setCustomers(data) })
    supabase.from('products').select('*').eq('is_available', true).order('product_number')
      .then(({ data }) => { if (data) setProducts(data) })
  }, [])

  function handleCustomerChange(id: string) {
    const c = customers.find(c => c.id === id) || null
    setSelectedCustomer(c)
    setFormData(f => ({ ...f, customerId: id }))
  }

  function addLineItem(isCredit = false) {
    setLineItems(prev => [...prev, {
      id:Math.random().toString(36).slice(2),
      productId:     '',
      productName:   '',
      productCode:   '',
      quantity:      1,
      unitPrice:     0,
      gstApplicable: true,
      isCredit,
      creditPercent: 100,
      creditType:    'product_credit',
      isCustom:      false,
    }])
  }

  function updateLineItem(id: string, field: string, value: any) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item
      if (field === 'productId') {
        const p = products.find(p => p.id === value)
        if (!p) return item
        const is900 = p.product_code === 900 || p.code === '900'
        return {
          ...item,
          productId:     p.id,
          productName:   is900 ? '' : p.name,
          productCode:   p.product_number || '',
          unitPrice:     is900 ? 0 : (p.unit_price || p.price || 0),
          gstApplicable: is900 ? false : (p.gst_applicable ?? true),
          isCustom:      is900,
        }
      }
      return { ...item, [field]: value }
    }))
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  function lineSubtotal(item: LineItem): number {
    const base = item.quantity * item.unitPrice * (item.isCredit ? item.creditPercent / 100 : 1)
    return item.isCredit ? -base : base
  }

  function lineGst(item: LineItem): number {
    const base = item.quantity * item.unitPrice * (item.isCredit ? item.creditPercent / 100 : 1)
    const gst  = item.gstApplicable ? base * 0.1 : 0
    return item.isCredit ? -gst : gst
  }

  function lineTotal(item: LineItem): number {
    return lineSubtotal(item) + lineGst(item)
  }

  const subtotal   = lineItems.reduce((s, i) => s + lineSubtotal(i), 0)
  const gstTotal   = lineItems.reduce((s, i) => s + lineGst(i), 0)
  const grandTotal = subtotal + gstTotal
  const hasCredits = lineItems.some(i => i.isCredit)

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

  function resetForm() {
    setFormData({
      customerId:          '',
      deliveryDate:        new Date().toISOString().split('T')[0],
      purchaseOrderNumber: '',
      docketNumber:        '',
      notes:               '',
    })
    setLineItems([])
    setSelectedCustomer(null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!formData.customerId) throw new Error('Please select a customer')
      if (!lineItems.length)    throw new Error('Please add at least one line item')
      if (lineItems.some(i => !i.productId || i.quantity <= 0))
        throw new Error('Please complete all line items')
      if (lineItems.some(i => i.isCustom && !i.productName.trim()))
        throw new Error('Please enter a description for custom (900) line items')

      const customer = selectedCustomer!

      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id:formData.customerId,
          customer_email:         customer.email,
          customer_business_name: customer.business_name,
          customer_address:       customer.address,
          customer_abn:           customer.abn,
          delivery_date:          formData.deliveryDate,
          total_amount:           grandTotal,
          status:                 'invoiced',
          source:                 'direct_invoice',
          notes:                  formData.notes || null,
          purchase_order_number:  formData.purchaseOrderNumber || null,
          docket_number:          formData.docketNumber || null,
        })
        .select()
        .single()

      if (orderError) throw new Error(`Order creation failed: ${orderError.message}`)

      // Create order items
      const { error: itemsError } = await supabase.from('order_items').insert(
        lineItems.map(item => ({
          order_id:       newOrder.id,
          product_id:     item.productId,
          product_name:   item.productName,
          quantity:       item.isCredit ? -item.quantity : item.quantity,
          unit_price:     item.unitPrice,
          subtotal:       lineSubtotal(item),
          gst_applicable: item.gstApplicable,
        }))
      )

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', newOrder.id)
        throw new Error(`Order items failed: ${itemsError.message}`)
      }

      // AR transaction
      const paymentTerms = customer.payment_terms || 30
      const dueDate      = new Date(formData.deliveryDate)
      dueDate.setDate(dueDate.getDate() + paymentTerms)

      const { error: arError } = await supabase.from('ar_transactions').insert({
        customer_id:  formData.customerId,
        type:         grandTotal < 0 ? 'credit' : 'invoice',
        amount:       Math.abs(grandTotal),
        amount_paid:  0,
        invoice_id:   newOrder.id,
        description:  `${grandTotal < 0 ? 'Credit invoice' : 'Direct invoice'} - ${customer.business_name}`,
        due_date:     dueDate.toISOString().split('T')[0],
      })

      if (arError) throw new Error(`AR transaction failed: ${arError.message}`)

      // Update customer balance
      await supabase
        .from('customers')
        .update({ balance: (customer.balance || 0) + grandTotal })
        .eq('id', formData.customerId)

   

// Record credit memo if credit lines exist
if (hasCredits) {
  try {
    const creditItems    = lineItems.filter(i => i.isCredit)
    const creditSubtotal = creditItems.reduce((s, i) => s + lineSubtotal(i), 0)
    const creditGst      = creditItems.reduce((s, i) => s + lineGst(i), 0)
    const creditTotal    = creditSubtotal + creditGst
    const allStale       = creditItems.every(i => i.creditType === 'stale_return')

    const { data: memo, error: memoError } = await supabase
      .from('credit_memos')
      .insert({
        customer_id:        formData.customerId,
        reference_order_id: newOrder.id,
        credit_type:        allStale ? 'stale_return' : 'product_credit',
        credit_number:      `CM-${Date.now().toString().slice(-6)}`,
        credit_date:        formData.deliveryDate,
        status:             'issued',
        notes:              formData.notes || null,
        reason:             'Included in direct invoice',
        applied_amount:     0,
        subtotal:           creditSubtotal,
        gst_amount:         creditGst,
        total_amount:       creditTotal,
        amount:             Math.abs(creditTotal),
      })
      .select()
      .single()

    if (memoError) {
      // Log but don't block — invoice is already saved
      console.error('Credit memo failed:', memoError.code, memoError.message, memoError.details)
    } else if (memo) {
      await supabase.from('credit_memo_items').insert(
        creditItems.map(i => ({
          credit_memo_id:     memo.id,
          product_id:         i.productId,
          product_name:       i.productName,
          product_code:       i.productCode,
          custom_description: i.productName,
          quantity:           i.quantity,
          unit_price:         i.unitPrice,
          total:              lineSubtotal(i),
          credit_percent:     i.creditPercent,
          line_total:         lineTotal(i),
          gst_applicable:     i.gstApplicable,
          gst_amount:         lineGst(i),
          credit_type:        i.creditType,}))
      )
    }
  } catch (memoErr) {
    console.error('Credit memo exception:', memoErr)
  }
}

      alert(
        `Invoice Created!\n\n` +
        `Order: ${newOrder.id.slice(0, 8)}\n` +
        `Subtotal: ${fmt(subtotal)}\n` +
        `GST: ${fmt(gstTotal)}\n` +
        `Total: ${fmt(grandTotal)}\n` +
        (formData.purchaseOrderNumber ? `PO#: ${formData.purchaseOrderNumber}\n` : '') +
        (formData.docketNumber ? `Docket#: ${formData.docketNumber}` : '')
      )

      resetForm()} catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <a href="/admin" className="flex items-center gap-1 text-sm mb-4 hover:opacity-80" style={{ color: '#CE1126' }}>
        <ArrowLeft className="h-4 w-4" /> Back to Admin Dashboard
      </a>

      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
          <FileText className="h-8 w-8" />
          Direct Invoice
        </h1>
        <p className="text-gray-600 mt-1">Create invoices with optional credit lines</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Customer Details */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Customer Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Customer *</label>
              <select
                value={formData.customerId}
                onChange={e => handleCustomerChange(e.target.value)}
                requiredclassName="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              >
                <option value="">-- Select Customer --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || c.email}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <p className="text-sm text-gray-500 mt-1">
                  Current balance:{' '}
                  <span className={selectedCustomer.balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                    {fmt(selectedCustomer.balance || 0)}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Delivery Date *</label>
              <input
                type="date"
                value={formData.deliveryDate}
                required
                onChange={e => setFormData(f => ({ ...f, deliveryDate: e.target.value }))}
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Purchase Order Number</label>
              <input
                type="text"
                value={formData.purchaseOrderNumber}
                placeholder="PO-2024-1234"
                onChange={e => setFormData(f => ({ ...f, purchaseOrderNumber: e.target.value }))}
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Docket Number</label>
              <input
                type="text"
                value={formData.docketNumber}
                placeholder="DOC-5678"
                onChange={e => setFormData(f => ({ ...f, docketNumber: e.target.value }))}
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Notes</label>
              <textarea
                value={formData.notes}
                rows={2}
                onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
                placeholder="Optional notes..."
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Line Items</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addLineItem(false)}
                className="flex items-center gap-2 px-4 py-2 rounded text-white text-sm hover:opacity-90"style={{ backgroundColor: '#006A4E' }}
              >
                <Plus className="h-4 w-4" /> Add Charge
              </button>
              <button
                type="button"
                onClick={() => addLineItem(true)}
                className="flex items-center gap-2 px-4 py-2 rounded text-white text-sm bg-orange-600 hover:bg-orange-700"
              >
                <MinusCircle className="h-4 w-4" /> Add Credit
              </button>
            </div>
          </div>

          {lineItems.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Add charge or credit lines above</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1 pb-1 border-b">
                <span className="col-span-1">Type</span>
                <span className="col-span-3">Product</span>
                <span className="col-span-1">Qty</span>
                <span className="col-span-2">Unit Price</span>
                <span className="col-span-1">CR%</span>
                <span className="col-span-1">Stale</span>
                <span className="col-span-1">GST</span>
                <span className="col-span-1 text-right">Total</span><span className="col-span-1"></span>
              </div>

              {lineItems.map(item => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 gap-2 items-center p-2 rounded ${
                    item.isCredit ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50'
                  }`}
                >
                  <div className="col-span-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      item.isCredit ? 'bg-orange-200 text-orange-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {item.isCredit ? 'CR' : 'DR'}
                    </span>
                  </div>

                  <div className="col-span-3">
                    <select
                      value={item.productId}
                      onChange={e => updateLineItem(item.id, 'productId', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                    >
                      <option value="">Select...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.product_number} - {p.name}
                        </option>
                      ))}
                    </select>
                    {item.isCustom && (
                      <input
                        type="text"
                        placeholder="Enter description..."
                        value={item.productName}
                        onChange={e => updateLineItem(item.id, 'productName', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm mt-1"
                      />
                    )}
                  </div>

                  <div className="col-span-1">
                    <input
                      type="number" min="0.1" step="0.1"
                      value={item.quantity}
                      onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>

                  <div className="col-span-2">
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unitPrice}
                      onChange={e => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>

                  <div className="col-span-1">
                    {item.isCredit ? (
                      <select
                        value={item.creditPercent}
                        onChange={e => updateLineItem(item.id, 'creditPercent', parseFloat(e.target.value))}
                        className="w-full border rounded px-1 py-1 text-sm bg-white"
                      >
                        {CREDIT_PERCENTS.map(p => (
                          <option key={p} value={p}>{p}%</option>
                        ))}
                      </select>
                    ) : <span className="text-gray-300 text-xs pl-2">—</span>}
                  </div>

                  <div className="col-span-1 flex justify-center">
                    {item.isCredit ? (
                      <input
                        type="checkbox"
                        checked={item.creditType === 'stale_return'}
                        title="Mark as stale return"
                        onChange={e => updateLineItem(
                          item.id, 'creditType',
                          e.target.checked ? 'stale_return' : 'product_credit'
                        )}
                      />
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      checked={item.gstApplicable}
                      onChange={e => updateLineItem(item.id, 'gstApplicable', e.target.checked)}
                    />
                  </div>

                  <div className={`col-span-1 text-sm font-medium text-right ${
                    item.isCredit ? 'text-orange-600' : 'text-gray-800'
                  }`}>
                    {item.isCredit
                      ? `(${fmt(Math.abs(lineTotal(item)))})`
                      : fmt(lineTotal(item))
                    }
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="border-t-2 pt-4 mt-2 space-y-1 text-right">
                <div className="text-sm text-gray-600">
                  Subtotal: <span className="font-medium ml-2">{fmt(subtotal)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  GST (10%): <span className="font-medium ml-2">{fmt(gstTotal)}</span>
                </div>
                <div className="text-xl font-bold" style={{ color: grandTotal < 0 ? '#CE1126' : '#006A4E' }}>
                  Total: {grandTotal < 0 ? `(${fmt(Math.abs(grandTotal))})` : fmt(grandTotal)}
                </div>
                {hasCredits && (
                  <p className="text-xs text-orange-600">
                    Includes credit lines — a credit memo will also be recorded
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="px-6 py-3 border rounded-md hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={loading || !lineItems.length}
            className="flex items-center gap-2 px-6 py-3 rounded text-white font-semibold hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#CE1126' }}
          >
            <DollarSign className="h-5 w-5" />
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}