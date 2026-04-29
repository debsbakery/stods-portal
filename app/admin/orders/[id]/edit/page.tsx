'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Trash2, Save, ArrowLeft, MinusCircle,
  Search, ChevronDown, X, AlertTriangle, Loader2
} from 'lucide-react'

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
  code: string
  price: number
  unit_price: number
  gst_applicable: boolean
  product_code: number
  product_number: string
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
  hasContract?: boolean
}

interface OrderRecord {
  id: string
  customer_id: string
  customer_email: string
  customer_business_name: string
  customer_address: string
  customer_abn: string
  delivery_date: string
  total_amount: number
  status: string
  source: string
  notes: string | null
  purchase_order_number: string | null
  docket_number: string | null
  invoice_number: string | null
}

interface OrderItemRecord {
  id: string
  order_id: string
  product_id: string
  product_name: string
  custom_description: string | null
  quantity: number
  unit_price: number
  subtotal: number
  gst_applicable: boolean
}

interface SelectOption {
  value: string
  label: string
  badge?: string
  sublabel?: string
}

const CREDIT_PERCENTS = [100, 75, 50, 25]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

// ── Searchable Select ─────────────────────────────────────────────────────────

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
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = query.trim() === ''
    ? options
    : options.filter(o => {
        const q = query.toLowerCase()
        return (
          String(o.label    ?? '').toLowerCase().includes(q) ||
          String(o.badge    ?? '').toLowerCase().includes(q) ||
          String(o.sublabel ?? '').toLowerCase().includes(q)
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
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={[
          'w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 text-sm text-left bg-white transition-colors focus:outline-none',
          disabled ? 'bg-gray-50 cursor-not-allowed text-gray-400' : 'cursor-pointer hover:border-gray-400',
          open ? 'border-green-700 ring-2 ring-green-100' : 'border-gray-300',
        ].join(' ')}
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
          <ChevronDown className={[
            'h-4 w-4 text-gray-400 transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-md shadow-xl flex flex-col max-h-72">
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
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">No results</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={() => handleSelect(opt)}
                  className={[
                    'w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-b border-gray-50 hover:bg-green-50 transition-colors',
                    opt.value === value ? 'bg-green-50 font-semibold' : '',
                  ].join(' ')}
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

// ── Main Edit Page ────────────────────────────────────────────────────────────

export default function EditOrderPage() {
  const supabase = createClient()
  const params   = useParams()
  const router   = useRouter()
  const orderId  = params.id as string

  const [customers,        setCustomers]       = useState<Customer[]>([])
  const [products,         setProducts]        = useState<Product[]>([])
  const [lineItems,        setLineItems]       = useState<LineItem[]>([])
  const [loading,          setLoading]         = useState(false)
  const [pageLoading,      setPageLoading]     = useState(true)
  const [error,            setError]           = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [contractPricing,  setContractPricing] = useState<Record<string, number>>({})
  const [originalOrder,    setOriginalOrder]   = useState<OrderRecord | null>(null)
  const [formData,         setFormData]        = useState({
    customerId:          '',
    deliveryDate:        '',
    purchaseOrderNumber: '',
    docketNumber:        '',
    notes:               '',
  })

  // ── Load everything on mount ───────────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      setPageLoading(true)
      try {
        const [custRes, prodRes] = await Promise.all([
          supabase.from('customers').select('*').order('business_name'),
          supabase.from('products').select('*').order('code'),
        ])
        const allCustomers = custRes.data || []
        const allProducts  = prodRes.data || []
        setCustomers(allCustomers)
        setProducts(allProducts)

        // Load the order
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single()

        if (orderErr || !order) throw new Error('Order not found')
        setOriginalOrder(order)

        // Load order items
        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId)
          .order('id')

        // Load contract pricing
        let contractMap: Record<string, number> = {}
        if (order.customer_id) {
          const { data: contracts } = await supabase
            .from('customer_pricing')
            .select('product_id, contract_price')
            .eq('customer_id', order.customer_id)

          if (contracts) {
            contracts.forEach((row: any) => { contractMap[row.product_id] = row.contract_price })
          }
        }
        setContractPricing(contractMap)

        // Set customer
        const cust = allCustomers.find(c => c.id === order.customer_id) || null
        setSelectedCustomer(cust)

        // Set form data
        setFormData({
          customerId:          order.customer_id              || '',
          deliveryDate:        order.delivery_date            || '',
          purchaseOrderNumber: order.purchase_order_number    || '',
          docketNumber:        order.docket_number            || '',
          notes:               order.notes                    || '',
        })

        // Convert DB items → LineItem[]
        if (items && items.length > 0) {
          const converted: LineItem[] = items.map((dbItem: OrderItemRecord) => {
            const product  = allProducts.find(p => p.id === dbItem.product_id)
            const isCredit = dbItem.quantity < 0 || dbItem.subtotal < 0
            const is900    = product?.code === '900' || product?.product_code === 900
            const code     = product?.code || product?.product_number || product?.product_code?.toString() || ''

            // Parse credit percent from product name
            let creditPercent = 100
            const percentMatch = dbItem.product_name?.match(/\((\d+)%\s*Credit\)/)
            if (percentMatch) creditPercent = parseInt(percentMatch[1])

            // Detect stale
            const isStale = dbItem.product_name?.toLowerCase().includes('stale') ||
                            dbItem.custom_description?.toLowerCase().includes('stale')

            // Clean product name
            let cleanName = dbItem.product_name || ''
            cleanName = cleanName.replace(/\s*\(\d+%\s*Credit\)/g, '').trim()
            if (cleanName === 'Manual Adjustment' && dbItem.custom_description) {
              cleanName = dbItem.custom_description.replace(/\s*\(\d+%\s*Credit\)/g, '').trim()
            }

            const hasContract = !is900 && contractMap[dbItem.product_id] !== undefined

            return {
              id:            Math.random().toString(36).slice(2),
              productId:     dbItem.product_id,
              productName:   is900 ? (dbItem.custom_description?.replace(/\s*\(\d+%\s*Credit\)/g, '').trim() || cleanName) : cleanName,
              productCode:   code,
              quantity:      Math.abs(dbItem.quantity),
              unitPrice:     dbItem.unit_price,
              gstApplicable: dbItem.gst_applicable ?? true,
              isCredit,
              creditPercent,
              creditType:    isStale ? 'stale_return' as const : 'product_credit' as const,
              isCustom:      is900 || false,
              hasContract,
            }
          })
          setLineItems(converted)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load order')
      } finally {
        setPageLoading(false)
      }
    }
    loadData()
  }, [orderId])

  // ── Options ────────────────────────────────────────────────────────────────

  const customerOptions: SelectOption[] = customers.map(c => ({
    value:    c.id,
    label:    c.business_name || c.email,
    sublabel: `Balance: ${fmt(c.balance || 0)}`,
  }))

  const productOptions: SelectOption[] = products.map(p => {
    const code     = p.code || p.product_number || p.product_code?.toString() || ''
    const is900    = p.code === '900' || p.product_code === 900
    const contract = contractPricing[p.id]
    const stdPrice = p.unit_price || p.price || 0
    const priceLabel = is900
      ? 'Enter custom description + amount'
      : contract !== undefined
        ? `Contract: ${fmt(contract)} | Std: ${fmt(stdPrice)} | ${p.gst_applicable ? 'GST' : 'No GST'}`
        : `${fmt(stdPrice)} | ${p.gst_applicable ? 'GST' : 'No GST'}`
    return {
      value:    p.id,
      label:    is900 ? 'Manual Adjustment' : p.name,
      badge:    String(code),
      sublabel: priceLabel,
    }
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleCustomerChange(id: string) {
    const c = customers.find(c => c.id === id) || null
    setSelectedCustomer(c)
    setFormData(f => ({ ...f, customerId: id }))

    if (id) {
      const { data } = await supabase
        .from('customer_pricing')
        .select('product_id, contract_price')
        .eq('customer_id', id)

      if (data) {
        const map: Record<string, number> = {}
        data.forEach((row: any) => { map[row.product_id] = row.contract_price })
        setContractPricing(map)
      } else {
        setContractPricing({})
      }
    } else {
      setContractPricing({})
    }
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
      hasContract:   false,
    }])
  }

  function updateLineItem(id: string, field: string, value: any) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item
      if (field === 'productId') {
        if (!value) return {
          ...item,
          productId: '', productName: '', productCode: '',
          unitPrice: 0, gstApplicable: true, isCustom: false, hasContract: false,
        }
        const p = products.find(p => p.id === value)
        if (!p) return item
        const is900         = p.code === '900' || p.product_code === 900
        const stdPrice      = p.unit_price || p.price || 0
        const contractPrice = contractPricing[p.id]
        const resolvedPrice = is900 ? 0 : (contractPrice ?? stdPrice)
        const hasContract   = !is900 && contractPrice !== undefined
        return {
          ...item,
          productId:     p.id,
          productName:   is900 ? '' : p.name,
          productCode:   p.code || p.product_number || p.product_code?.toString() || '',
          unitPrice:     resolvedPrice,
          gstApplicable: is900 ? false : (p.gst_applicable ?? true),
          isCustom:      is900,
          hasContract,
        }
      }
      return { ...item, [field]: value }
    }))
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  // ── Calculations ───────────────────────────────────────────────────────────

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

  const isInvoiced = originalOrder?.status === 'invoiced'
  const totalDiff  = originalOrder ? grandTotal - originalOrder.total_amount : 0

  // ── Submit (Update) ────────────────────────────────────────────────────────

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
        throw new Error('Please enter a description for Manual Adjustment lines')
      if (!originalOrder)
        throw new Error('Original order not loaded')

      const customer = selectedCustomer
      if (!customer) throw new Error('Customer not found')

      const oldTotal = originalOrder.total_amount || 0

      // ── Step 1: Update the order record ────────────────────────────────

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          customer_id:            formData.customerId,
          customer_email:         customer.email,
          customer_business_name: customer.business_name,
          customer_address:       customer.address,
          customer_abn:           customer.abn,
          delivery_date:          formData.deliveryDate,
          total_amount:           grandTotal,
          notes:                  formData.notes               || null,
          purchase_order_number:  formData.purchaseOrderNumber || null,
          docket_number:          formData.docketNumber        || null,
        })
        .eq('id', orderId)

      if (updateError) throw new Error(`Order update failed: ${updateError.message}`)

      // ── Step 2: Delete old order items, insert new ones ────────────────

      const { error: deleteItemsErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId)

      if (deleteItemsErr) throw new Error(`Failed to clear old items: ${deleteItemsErr.message}`)

      const sortedItems = [
        ...lineItems.filter(i => i.productCode === '900'),
        ...lineItems.filter(i => i.productCode !== '900'),
      ]

      const { error: insertItemsErr } = await supabase
        .from('order_items')
        .insert(sortedItems.map(item => {
          const creditLabel = item.isCredit && item.creditPercent < 100
            ? ` (${item.creditPercent}% Credit)`
            : item.isCredit ? ' (100% Credit)' : ''
          return {
            order_id:           orderId,
            product_id:         item.productId,
            product_name:       item.isCustom ? 'Manual Adjustment' : item.productName + creditLabel,
            custom_description: item.isCustom ? item.productName + creditLabel : null,
            quantity:           item.isCredit ? -item.quantity : item.quantity,
            unit_price:         item.unitPrice,
            subtotal:           lineSubtotal(item),
            gst_applicable:     item.gstApplicable,
          }
        }))

      if (insertItemsErr) throw new Error(`Failed to save items: ${insertItemsErr.message}`)

      // ── Step 3: If invoiced → delete old AR + create new AR ────────────

      if (isInvoiced) {
        // 3a: Reverse old customer balance
        await supabase.rpc('increment_customer_balance', {
          p_customer_id: originalOrder.customer_id,
          p_amount:      -oldTotal,
        })

        // 3b: Delete old AR transaction for this order
        const { error: deleteArErr } = await supabase
          .from('ar_transactions')
          .delete()
          .eq('invoice_id', orderId)

        if (deleteArErr) {
          console.error('AR delete warning:', deleteArErr.message)
        }

        // 3c: Delete old credit memos for this order
        const { data: oldMemos } = await supabase
          .from('credit_memos')
          .select('id')
          .eq('reference_order_id', orderId)

        if (oldMemos && oldMemos.length > 0) {
          const memoIds = oldMemos.map(m => m.id)
          await supabase
            .from('credit_memo_items')
            .delete()
            .in('credit_memo_id', memoIds)
          await supabase
            .from('credit_memos')
            .delete()
            .eq('reference_order_id', orderId)
        }

        // 3d: Create new AR transaction
        const paymentTerms = customer.payment_terms || 30
        const dueDate      = new Date(formData.deliveryDate)
        dueDate.setDate(dueDate.getDate() + paymentTerms)

        const { error: arError } = await supabase
          .from('ar_transactions')
          .insert({
            customer_id:  formData.customerId,
            type:         grandTotal < 0 ? 'credit' : 'invoice',
            amount:       Math.abs(grandTotal),
            amount_paid:  0,
            invoice_id:   orderId,
            description:  `${grandTotal < 0 ? 'Credit invoice' : 'Invoice'} (edited) - ${customer.business_name}`,
            due_date:     dueDate.toISOString().split('T')[0],
          })

        if (arError) throw new Error(`AR transaction failed: ${arError.message}`)

        // 3e: Apply new total to customer balance
        await supabase.rpc('increment_customer_balance', {
          p_customer_id: formData.customerId,
          p_amount:      grandTotal,
        })
      }

      // ── Step 4: Handle credit memos for new line items ─────────────────

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
              reference_order_id: orderId,
              credit_type:        allStale ? 'stale_return' : 'product_credit',
              credit_number:      `CM-${Date.now().toString().slice(-6)}`,
              credit_date:        formData.deliveryDate,
              status:             'issued',
              notes:              formData.notes || null,
              reason:             'Order edit credit',
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
                total:              Math.abs(lineSubtotal(i)),
                credit_percent:     i.creditPercent,
                line_total:         Math.abs(lineTotal(i)),
                gst_applicable:     i.gstApplicable,
                gst_amount:         Math.abs(lineGst(i)),
                credit_type:        i.creditType,
              }))
            )
          }
        } catch (memoErr) {
          console.error('Credit memo exception:', memoErr)
        }
      }

      // ── Done ───────────────────────────────────────────────────────────

      const diffMsg = isInvoiced && totalDiff !== 0
        ? `\n\nAR adjusted: ${totalDiff > 0 ? '+' : ''}${fmt(totalDiff)}`
        : ''

      alert(
        `Order Updated!\n\nSubtotal: ${fmt(subtotal)}\nGST: ${fmt(gstTotal)}\nTotal: ${fmt(grandTotal)}${diffMsg}${hasCredits ? '\n\n✅ Credit memo recorded' : ''}`
      )

      router.push(`/admin/orders/${orderId}`)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Loading State ──────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500">Loading order...</p>
        </div>
      </div>
    )
  }

  if (!originalOrder) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-semibold">Order not found</p>
          <a href="/admin/orders" className="text-sm underline mt-2 inline-block">Back to Orders</a>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto">

      <a
        href={`/admin/orders/${orderId}`}
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Order
      </a>

      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
          <Save className="h-8 w-8" /> Edit Order
        </h1>
        <p className="text-gray-600 mt-1">
          Order #{orderId.slice(0, 8)}...
          {originalOrder.invoice_number && (
            <span className="ml-2 font-semibold text-gray-800">
              Invoice #{String(originalOrder.invoice_number).padStart(6, '0')}
            </span>
          )}
        </p>
      </div>

      {/* Invoiced warning banner */}
      {isInvoiced && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">This order has been invoiced</p>
            <p className="text-sm text-amber-700 mt-1">
              Saving changes will <strong>delete the existing AR transaction</strong> and create a new one
              with the updated total. The customer balance will be recalculated automatically.
            </p>
            {totalDiff !== 0 && (
              <p className="text-sm font-semibold mt-2" style={{ color: totalDiff > 0 ? '#CE1126' : '#006A4E' }}>
                Current difference: {totalDiff > 0 ? '+' : ''}{fmt(totalDiff)}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">
          {error}
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
                  {' | '}Terms: {selectedCustomer.payment_terms || 30} days
                  {Object.keys(contractPricing).length > 0 && (
                    <span className="ml-2 text-blue-600 font-semibold text-xs">
                      {Object.keys(contractPricing).length} contract price{Object.keys(contractPricing).length !== 1 ? 's' : ''} active
                    </span>
                  )}
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
                <Plus className="h-4 w-4" /> Add Item
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
            <p className="text-gray-400 text-center py-8">Add items or credit lines above</p>
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

              {/* Rows */}
              {lineItems.map(item => (
                <div
                  key={item.id}
                  className={[
                    'grid grid-cols-12 gap-2 items-start p-2 rounded',
                    item.isCredit ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50',
                  ].join(' ')}
                >
                  {/* Type badge */}
                  <div className="col-span-1 pt-2">
                    <span className={[
                      'text-xs px-1.5 py-0.5 rounded font-medium',
                      item.isCredit ? 'bg-orange-200 text-orange-800' : 'bg-green-100 text-green-800',
                    ].join(' ')}>
                      {item.isCredit ? 'CR' : 'DR'}
                    </span>
                  </div>

                  {/* Product select + GST toggle */}
                  <div className="col-span-4">
                    <SearchableSelect
                      options={productOptions}
                      value={item.productId}
                      onChange={val => updateLineItem(item.id, 'productId', val)}
                      placeholder="Select product..."
                    />
                    {item.isCustom && (
                      <input
                        type="text"
                        placeholder="Enter description..."
                        value={item.productName}
                        onChange={e => updateLineItem(item.id, 'productName', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm border-orange-300 mt-1 focus:outline-none focus:border-green-600"
                      />
                    )}
                    {item.productId && (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none mt-1">
                        <input
                          type="checkbox"
                          checked={item.gstApplicable}
                          onChange={e => updateLineItem(item.id, 'gstApplicable', e.target.checked)}
                          className="rounded accent-green-600"
                        />
                        <span className="text-xs text-gray-600 font-medium">GST (10%)</span>
                        {item.gstApplicable && item.unitPrice > 0 && (
                          <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-mono">
                            +{fmt(item.quantity * item.unitPrice * 0.1)}
                          </span>
                        )}
                      </label>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={e => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full border rounded px-2 py-1.5 text-sm"
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
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                    {item.hasContract && (
                      <span className="text-xs text-blue-600 font-semibold">Contract</span>
                    )}
                  </div>

                  {/* Credit percent */}
                  <div className="col-span-1">
                    {item.isCredit ? (
                      <select
                        value={item.creditPercent}
                        onChange={e => updateLineItem(item.id, 'creditPercent', parseFloat(e.target.value))}
                        className="w-full border rounded px-1 py-1.5 text-sm bg-white"
                      >
                        {CREDIT_PERCENTS.map(p => (
                          <option key={p} value={p}>{p}%</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-300 text-xs pl-2">-</span>
                    )}
                  </div>

                  {/* Stale checkbox */}
                  <div className="col-span-1 flex justify-center pt-2">
                    {item.isCredit ? (
                      <input
                        type="checkbox"
                        title="Mark as stale return"
                        checked={item.creditType === 'stale_return'}
                        onChange={e => updateLineItem(item.id, 'creditType', e.target.checked ? 'stale_return' : 'product_credit')}
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </div>

                  {/* Line total */}
                  <div className={[
                    'col-span-1 text-sm font-medium text-right pt-2',
                    item.isCredit ? 'text-orange-600' : 'text-gray-800',
                  ].join(' ')}>
                    {item.isCredit
                      ? `(${fmt(Math.abs(lineTotal(item)))})`
                      : fmt(lineTotal(item))}
                    {item.isCredit && (
                      <div className="text-xs text-orange-500 font-normal">
                        {item.creditPercent}% CR
                      </div>
                    )}
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex justify-center pt-1.5">
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

                {/* Show diff from original if invoiced */}
                {isInvoiced && totalDiff !== 0 && (
                  <div className="text-sm font-semibold" style={{ color: totalDiff > 0 ? '#CE1126' : '#006A4E' }}>
                    Change from original: {totalDiff > 0 ? '+' : ''}{fmt(totalDiff)}
                  </div>
                )}

                {hasCredits && (
                  <p className="text-xs text-orange-600">
                    Includes credit lines — a credit memo will be recorded
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Submit ── */}
        <div className="flex justify-between items-center pb-8">
          <a
            href={`/admin/orders/${orderId}`}
            className="px-6 py-3 border rounded-md hover:bg-gray-50 text-sm"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={loading || !lineItems.length}
            className="flex items-center gap-2 px-6 py-3 rounded text-white font-semibold hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#CE1126' }}
          >
            <Save className="h-5 w-5" />
            {loading ? 'Saving...' : isInvoiced ? 'Save & Recalculate AR' : 'Save Changes'}
          </button>
        </div>

      </form>
    </div>
  )
}