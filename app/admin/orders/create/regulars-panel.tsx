'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Regular {
  product_id:    string
  product_code:  string | null
  name:          string | null
  unit_price:    number
  has_contract:  boolean
  gst_applicable: boolean | null
  order_count:   number
  last_qty:      number | null
  pinned:        boolean
}

interface OrderLine {
  product_id:    string
  product_code:  string | null
  name:          string
  quantity:      number
  unit_price:    number
  gst_applicable: boolean
}

interface Props {
  customerId:  string
  customerName: string
  onAddLines:  (lines: OrderLine[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegularsPanel({ customerId, customerName, onAddLines }: Props) {
  const [regulars,    setRegulars]    = useState<Regular[]>([])
  const [quantities,  setQuantities]  = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [copying,     setCopying]     = useState(false)
  const [lastOrderDate, setLastOrderDate] = useState<string | null>(null)
  const [showManage,  setShowManage]  = useState(false)
  const [savingPin,   setSavingPin]   = useState<string | null>(null)
  const [addedFlash,  setAddedFlash]  = useState<string | null>(null)

  // ── Fetch regulars ──────────────────────────────────────────────────────────
  const fetchRegulars = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/regulars`)
      const data = await res.json()
      setRegulars(data.regulars ?? [])
    } catch (err) {
      console.error('Failed to load regulars:', err)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  // ── Fetch last order date (for button label) ────────────────────────────────
  const fetchLastOrderDate = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/last-order`)
      const data = await res.json()
      if (data.order?.delivery_date) {
        const d = new Date(`${data.order.delivery_date}T00:00:00`)
        setLastOrderDate(d.toLocaleDateString('en-AU', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        }))
      } else {
        setLastOrderDate(null)
      }
    } catch {
      setLastOrderDate(null)
    }
  }, [customerId])

  useEffect(() => {
    fetchRegulars()
    fetchLastOrderDate()
  }, [fetchRegulars, fetchLastOrderDate])

  // ── Handle qty input change ─────────────────────────────────────────────────
  const setQty = (productId: string, value: string) => {
    // Allow empty string (blank) or positive integers only
    if (value === '' || /^\d+$/.test(value)) {
      setQuantities(prev => ({ ...prev, [productId]: value }))
    }
  }

  // ── Add single item ─────────────────────────────────────────────────────────
  const addSingle = (reg: Regular) => {
    const qtyStr = quantities[reg.product_id]
    const qty    = parseInt(qtyStr ?? '')
    if (!qty || qty <= 0) {
      // Flash the input to prompt entry
      const el = document.getElementById(`qty-${reg.product_id}`)
      if (el) {
        el.classList.add('ring-2', 'ring-red-400')
        setTimeout(() => el.classList.remove('ring-2', 'ring-red-400'), 1500)
      }
      return
    }

    onAddLines([{
      product_id:    reg.product_id,
      product_code:  reg.product_code,
      name:          reg.name ?? 'Unknown',
      quantity:      qty,
      unit_price:    reg.unit_price,
      gst_applicable: reg.gst_applicable ?? true,
    }])

    // Flash success
    setAddedFlash(reg.product_id)
    setTimeout(() => setAddedFlash(null), 1200)

    // Clear qty input
    setQuantities(prev => ({ ...prev, [reg.product_id]: '' }))
  }

  // ── Add all items that have a qty ───────────────────────────────────────────
  const addAllWithQty = () => {
    const lines: OrderLine[] = []
    for (const reg of regulars) {
      const qty = parseInt(quantities[reg.product_id] ?? '')
      if (qty > 0) {
        lines.push({
          product_id:    reg.product_id,
          product_code:  reg.product_code,
          name:          reg.name ?? 'Unknown',
          quantity:      qty,
          unit_price:    reg.unit_price,
          gst_applicable: reg.gst_applicable ?? true,
        })
      }
    }
    if (lines.length === 0) return
    onAddLines(lines)
    // Clear all qty inputs
    setQuantities({})
  }

  // ── Copy last order ─────────────────────────────────────────────────────────
  const copyLastOrder = async () => {
    setCopying(true)
    try {
      const res  = await fetch(`/api/admin/customers/${customerId}/last-order`)
      const data = await res.json()
      if (!data.items?.length) {
        alert('No previous orders found for this customer.')
        return
      }
      onAddLines(data.items.map((item: any) => ({
        product_id:    item.product_id,
        product_code:  item.product_code,
        name:          item.name,
        quantity:      item.quantity,
        unit_price:    item.unit_price,
        gst_applicable: item.gst_applicable ?? true,
      })))
    } catch (err) {
      alert('Failed to load last order.')
    } finally {
      setCopying(false)
    }
  }

  // ── Toggle pin ──────────────────────────────────────────────────────────────
  const togglePin = async (reg: Regular) => {
    setSavingPin(reg.product_id)
    try {
      await fetch(`/api/admin/customers/${customerId}/regulars`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: reg.product_id,
          pinned: !reg.pinned,
          hidden: false,
        }),
      })
      await fetchRegulars()
    } finally {
      setSavingPin(null)
    }
  }

  // ── Toggle hide ─────────────────────────────────────────────────────────────
  const hideProduct = async (reg: Regular) => {
    setSavingPin(reg.product_id)
    try {
      await fetch(`/api/admin/customers/${customerId}/regulars`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: reg.product_id,
          pinned: false,
          hidden: true,
        }),
      })
      await fetchRegulars()
    } finally {
      setSavingPin(null)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-amber-700 text-sm">
          <span className="animate-spin">⏳</span>
          Loading regulars for {customerName}...
        </div>
      </div>
    )
  }

  if (regulars.length === 0) {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-500">
          ⭐ No regular products yet for <strong>{customerName}</strong>
          {' '}— products ordered ≥3 times in the last 60 days will appear here.
        </p>
        {lastOrderDate && (
          <button
            onClick={copyLastOrder}
            disabled={copying}
            className="mt-2 text-sm px-3 py-1.5 bg-white border border-gray-300 
                       rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {copying ? '⏳ Loading...' : `📋 Copy Last Order (${lastOrderDate})`}
          </button>
        )}
      </div>
    )
  }

  const filledCount = Object.values(quantities).filter(
    q => parseInt(q) > 0
  ).length

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 font-semibold text-sm">
            ⭐ Regulars
          </span>
          <span className="text-xs text-gray-500">
            {regulars.length} product{regulars.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastOrderDate && (
            <button
              onClick={copyLastOrder}
              disabled={copying}
              className="text-xs px-2.5 py-1.5 bg-white border border-gray-300 
                         rounded-md hover:bg-gray-50 disabled:opacity-50 
                         transition-colors text-gray-600 font-medium"
            >
              {copying ? '⏳...' : `📋 Copy Last Order (${lastOrderDate})`}
            </button>
          )}
          <button
            onClick={() => setShowManage(m => !m)}
            className="text-xs px-2.5 py-1.5 bg-white border border-gray-300 
                       rounded-md hover:bg-gray-50 transition-colors text-gray-600"
          >
            {showManage ? '✕ Done' : '⚙️ Manage'}
          </button>
        </div>
      </div>

      {/* ── Manage mode hint ── */}
      {showManage && (
        <div className="mb-2 px-3 py-2 bg-white border border-amber-200 
                        rounded-md text-xs text-gray-600">
          📌 <strong>Pin</strong> to always show a product&nbsp;&nbsp;
          🙈 <strong>Hide</strong> to remove it from this list
        </div>
      )}

      {/* ── Product table ── */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium w-16">
                Code
              </th>
              <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">
                Product
              </th>
              <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium w-24">
                Price
              </th>
              <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium w-32">
                Qty
              </th>
              <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium w-20">
                {showManage ? 'Actions' : 'Add'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {regulars.map((reg) => {
              const isAdded = addedFlash === reg.product_id
              const isSaving = savingPin === reg.product_id

              return (
                <tr
                  key={reg.product_id}
                  className={`transition-colors ${
                    isAdded ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Code */}
                  <td className="px-3 py-2 text-xs text-gray-400 font-mono">
                    {reg.product_code ?? '—'}
                  </td>

                  {/* Name + badges */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-gray-800 font-medium">
                        {reg.name ?? 'Unknown'}
                      </span>
                      {reg.pinned && (
                        <span className="text-xs bg-amber-100 text-amber-700 
                                         px-1.5 py-0.5 rounded-full">
                          📌 pinned
                        </span>
                      )}
                      {reg.has_contract && (
                        <span className="text-xs bg-blue-50 text-blue-600 
                                         px-1.5 py-0.5 rounded-full">
                          contract
                        </span>
                      )}
                      {reg.order_count > 0 && (
                        <span className="text-xs text-gray-400">
                          ×{reg.order_count}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2 text-right text-gray-700">
                    ${reg.unit_price.toFixed(2)}
                  </td>

                  {/* Qty input with last-qty hint */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <input
                        id={`qty-${reg.product_id}`}
                        type="number"
                        min="0"
                        value={quantities[reg.product_id] ?? ''}
                        onChange={e => setQty(reg.product_id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addSingle(reg)
                        }}
                        placeholder="qty"
                        className="w-20 text-center border border-gray-300 rounded-md 
                                   px-2 py-1.5 text-sm focus:outline-none focus:ring-2 
                                   focus:ring-amber-400 focus:border-transparent
                                   transition-all"
                      />
                      {reg.last_qty !== null && (
                        <span className="text-xs text-gray-400">
                          last: {reg.last_qty}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Add / manage buttons */}
                  <td className="px-3 py-2 text-center">
                    {showManage ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => togglePin(reg)}
                          disabled={isSaving}
                          title={reg.pinned ? 'Unpin' : 'Pin to always show'}
                          className={`text-sm px-2 py-1 rounded transition-colors 
                                      disabled:opacity-50 ${
                            reg.pinned
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-amber-100'
                          }`}
                        >
                          📌
                        </button>
                        <button
                          onClick={() => hideProduct(reg)}
                          disabled={isSaving}
                          title="Hide from regulars"
                          className="text-sm px-2 py-1 rounded bg-gray-100 
                                     text-gray-500 hover:bg-red-100 hover:text-red-600 
                                     transition-colors disabled:opacity-50"
                        >
                          🙈
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addSingle(reg)}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium 
                                    transition-all ${
                          isAdded
                            ? 'bg-green-500 text-white'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        {isAdded ? '✓' : '+ Add'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Add All button ── */}
      {!showManage && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Enter quantities above, then&nbsp;
            <strong>+ Add</strong> individually or&nbsp;
            <strong>Add All</strong> at once.
            Press <kbd className="bg-gray-100 px-1 rounded text-xs">Enter</kbd> in
            any qty box to add that row.
          </span>
          <button
            onClick={addAllWithQty}
            disabled={filledCount === 0}
            className="ml-3 flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 
                       text-white text-sm font-medium rounded-md transition-colors 
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✅ Add All ({filledCount})
          </button>
        </div>
      )}
    </div>
  )
}