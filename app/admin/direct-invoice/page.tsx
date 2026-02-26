'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, FileText, DollarSign, ArrowLeft, MinusCircle, Search, ChevronDown, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Searchable Select Component ──────────────────────────────────────────────
interface SelectOption {
  value: string
  label: string
  badge?: string
  sublabel?: string
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
}: {
  options: SelectOption[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = query.trim() === ''
    ? options
    : options.filter(o => {
        const q = query.toLowerCase()
        return (
          o.label.toLowerCase().includes(q) ||
          (o.badge    ?? '').toLowerCase().includes(q) ||
          (o.sublabel ?? '').toLowerCase().includes(q)
        )
      })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleSelect(opt: SelectOption) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`
          w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 text-sm text-left bg-white
          transition-colors focus:outline-none
          ${disabled ? 'bg-gray-50 cursor-not-allowed text-gray-400' : 'cursor-pointer hover:border-gray-400'}
          ${open ? 'border-green-700 ring-2 ring-green-100' : 'border-gray-300'}
        `}
      >
        <span className="flex-1 truncate flex items-center gap-2">
          {selected ? (
            <>
              {selected.badge && (
                <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">
                  {selected.badge}
                </span>
              )}
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              onMouseDown={e => { e.stopPropagation(); onChange('') }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-md shadow-xl flex flex-col max-h-72">
          {/* Search input */}
          <div className="p-2 border-b bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-green-600"
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={() => handleSelect(opt)}
                  className={`
                    w-full text-left px-3 py-2.5 text-sm flex items-center gap-2
                    border-b border-gray-50 hover:bg-green-50 transition-colors
                    ${opt.value === value ? 'bg-green-50 font-semibold' : ''}
                  `}
                >
                  {opt.badge && (
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 shrink-0 min-w-[2.5rem] text-center">
                      {opt.badge}
                    </span>
                  )}
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-xs text-gray-400 truncate">{opt.sublabel}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          {query && (
            <div className="px-3 py-1 text-xs text-gray-400 border-t bg-gray-50">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DirectInvoicePage() {
  const [customers,        setCustomers]        = useState<Customer[]>([])
  const [products,         setProducts]         = useState<Product[]>([])
  const [lineItems,        setLineItems]        = useState<LineItem[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
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
    supabase
      .from('customers')
      .select('*')
      .order('business_name')
      .then(({ data }) => { if (data) setCustomers(data) })

    supabase
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('code')
      .then(({ data }) => { if (data) setProducts(data) })
  }, [])

  // ── Dropdown option builders ────────────────────────────────────────────────
  const customerOptions: SelectOption[] = customers.map(c => ({
    value:    c.id,
    label:    c.business_name || c.email,
    sublabel: `Balance: $${(c.balance || 0).toFixed(2)}`,
  }))

  const productOptions: SelectOption[] = products.map(p => {
    const displayCode = p.code || p.product_number || p.product_code?.toString() || ''
    const is900       = p.code === '900' || p.product_code === 900
    return {
      value:    p.id,
      label:    is900 ? 'Manual Adjustment' : p.name,
      badge:    displayCode,
      sublabel: is900
        ? 'Enter custom amount · No GST'
        : `$${(p.unit_price || p.price || 0).toFixed(2)} | ${p.gst_applicable ? 'GST' : 'No GST'}`,
    }
  })

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleCustomerChange(id: string) {
    const c = customers.find(c => c.id === id) || null
    setSelectedCustomer(c)
    setFormData(f => ({ ...f, customerId: id }))
  }

  function addLineItem(isCredit = false) {
    setLineItems(prev => [...prev, {
      id:            Math.random().toString(36).slice(2),
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
        if (!value) return {
          ...item,
          productId:   '',
          productName: '',
          productCode: '',
          unitPrice:   0,
          isCustom:    false,
        }
        const p = products.find(p => p.id === value)
        if (!p) return item
        // ✅ Check BOTH fields — DB has code='900', product_code=null
        const is900 = p.code === '900' || p.product_code === 900
        return {
          ...item,
          productId:     p.id,
          productName:   is900 ? '' : p.name,
          // ✅ FIX: store p.code not p.product_number so sort filter works
          productCode:   p.code || p.product_number || p.product_code?.toString() || '',
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

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!formData.customerId)
        throw new Error('Please select a customer')
      if (!lineItems.length)
        throw new Error('Please add at least one line item')
      if (lineItems.some(i => !i.productId || i.quantity <= 0))
        throw new Error('Please complete all line items')
      if (lineItems.some(i => i.isCustom && !i.productName.trim()))
        throw new Error('Please enter a description for Manual Adjustment (900) lines')

      const customer = selectedCustomer!

      // ✅ Sort: 900 lines always first in the invoice
      const sortedItems = [
        ...lineItems.filter(i => i.productCode === '900'),
        ...lineItems.filter(i => i.productCode !== '900'),
      ]

      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id:            formData.customerId,
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

      // ✅ FIX: insert sortedItems (was lineItems before — sort had no effect)
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(
          sortedItems.map(item => ({
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

      // Credit memo if credit lines exist
      if (hasCredits) {
        try {
          const creditLines    = lineItems.filter(i => i.isCredit)
          const creditSubtotal = creditLines.reduce((s, i) => s + lineSubtotal(i), 0)
          const creditGst      = creditLines.reduce((s, i) => s + lineGst(i), 0)
          const creditTotal    = creditSubtotal + creditGst
          const allStale       = creditLines.every(i => i.creditType === 'stale_return')

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
              reason:             'Direct invoice',
              applied_amount:     0,
              subtotal:           creditSubtotal,
              gst_amount:         creditGst,
              total_amount:       creditTotal,
              amount:             Math.abs(creditTotal),
            })
            .select()
            .single()

          if (memoError) {
            console.error('Credit memo failed:', memoError.message)
          } else if (memo) {
            await supabase.from('credit_memo_items').insert(
              creditLines.map(i => ({
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
                credit_type:        i.creditType,
              }))
            )
          }
        } catch (memoErr) {
          console.error('Credit memo exception:', memoErr)
        }
      }

      alert(
        `✅ Invoice Created!\n\n` +
        `Order: ${newOrder.id.slice(0, 8)}\n` +
        `Subtotal: ${fmt(subtotal)}\n` +
        `GST: ${fmt(gstTotal)}\n` +
        `Total: ${fmt(grandTotal)}\n` +
        (formData.purchaseOrderNumber ? `PO#: ${formData.purchaseOrderNumber}\n` : '') +
        (formData.docketNumber        ? `Docket#: ${formData.docketNumber}`       : '')
      )

      resetForm()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <a
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
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
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Customer Details ── */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Customer Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">
                Customer <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={customerOptions}
                value={formData.customerId}
                onChange={handleCustomerChange}
                placeholder="Search customer by name..."
              />
              {selectedCustomer && (
                <p className="text-sm text-gray-500 mt-1.5">
                  Balance:{' '}
                  <span className={selectedCustomer.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                    {fmt(selectedCustomer.balance || 0)}
                  </span>
                  {' '}· Terms: {selectedCustomer.payment_terms || 30} days
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

        {/* ── Line Items ── */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Line Items</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addLineItem(false)}
                className="flex items-center gap-2 px-4 py-2 rounded text-white text-sm hover:opacity-90"
                style={{ backgroundColor: '#006A4E' }}
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
            <p className="text-gray-400 text-center py-8">
              Add charge or credit lines above
            </p>
          ) : (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1 pb-1 border-b">
                <span className="col-span-1">Type</span>
                <span className="col-span-4">Product</span>
                <span className="col-span-1">Qty</span>
                <span className="col-span-2">Unit $</span>
                <span className="col-span-1">CR%</span>
                <span className="col-span-1">Stale</span>
                <span className="col-span-1 text-right">Total</span>
                <span className="col-span-1"></span>
              </div>

              {lineItems.map(item => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 gap-2 items-start p-2 rounded ${
                    item.isCredit
                      ? 'bg-orange-50 border border-orange-100'
                      : 'bg-gray-50'
                  }`}
                >
                  {/* Type badge */}
                  <div className="col-span-1 pt-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      item.isCredit
                        ? 'bg-orange-200 text-orange-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {item.isCredit ? 'CR' : 'DR'}
                    </span>
                  </div>

                  {/* Product searchable dropdown */}
                  <div className="col-span-4">
                    <SearchableSelect
                      options={productOptions}
                      value={item.productId}
                      onChange={val => updateLineItem(item.id, 'productId', val)}
                      placeholder="Select product..."
                    />
                    {/* Description input for code 900 */}
                    {item.isCustom && (
                      <input
                        type="text"
                        placeholder="Enter description for this adjustment..."
                        value={item.productName}
                        onChange={e => updateLineItem(item.id, 'productName', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm mt-1 border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={item.quantity}
                      onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>

                  {/* Unit price */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={e => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>

                  {/* Credit % */}
                  <div className="col-span-1">
                    {item.isCredit ? (
                      <select
                        value={item.creditPercent}
                        onChange={e => updateLineItem(item.id, 'creditPercent', parseFloat(e.target.value))}
                        className="w-full border rounded px-1 py-1.5 text-sm bg-white focus:outline-none"
                      >
                        {CREDIT_PERCENTS.map(p => (
                          <option key={p} value={p}>{p}%</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-300 text-xs pl-2">—</span>
                    )}
                  </div>

                  {/* Stale return checkbox */}
                  <div className="col-span-1 flex justify-center pt-2">
                  {/* Stale return checkbox */}
                  <div className="col-span-1 flex justify-center pt-2">
                    {item.isCredit ? (
                      <input
                        type="checkbox"
                        title="Mark as stale return"
                        checked={item.creditType === 'stale_return'}
                        onChange={e => updateLineItem(
                          item.id,
                          'creditType',
                          e.target.checked ? 'stale_return' : 'product_credit'
                        )}
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </div>

                  {/* Line total */}
                  <div className={`col-span-1 text-sm font-medium text-right pt-2 ${
                    item.isCredit ? 'text-orange-600' : 'text-gray-800'
                  }`}>
                    {item.isCredit
                      ? `(${fmt(Math.abs(lineTotal(item)))})`
                      : fmt(lineTotal(item))
                    }
                  </div>

                  {/* Delete button */}
                  <div className="col-span-1 flex justify-center pt-1.5">
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
              <div className="border-t-2 pt-4 mt-2 space-y-1 text-right">
                <div className="text-sm text-gray-600">
                  Subtotal: <span className="font-medium ml-2">{fmt(subtotal)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  GST (10%): <span className="font-medium ml-2">{fmt(gstTotal)}</span>
                </div>
                <div
                  className="text-xl font-bold"
                  style={{ color: grandTotal < 0 ? '#CE1126' : '#006A4E' }}
                >
                  Total: {grandTotal < 0 ? `(${fmt(Math.abs(grandTotal))})` : fmt(grandTotal)}
                </div>
                {hasCredits && (
                  <p className="text-xs text-orange-600">
                    ⚠️ Includes credit lines — a credit memo will also be recorded
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Submit ── */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={resetForm}
            className="px-6 py-3 border rounded-md hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={loading || !lineItems.length}
            className="flex items-center gap-2 px-6 py-3 rounded text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#CE1126' }}
          >
            <DollarSign className="h-5 w-5" />
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}                    {item.isCredit ? (
                      <input
                        type="checkbox"
                        title="Mark as stale return