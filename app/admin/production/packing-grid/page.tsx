'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer, Calendar } from 'lucide-react'
import Link from 'next/link'

interface Cell {
  qty: number
}

export default function PackingGridPage() {
  const supabase = createClient()
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<{ id: string; code: number; name: string }[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string; shortName: string }[]>([])
  const [grid, setGrid] = useState<Record<string, Record<string, number>>>({})
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (date) loadGrid() }, [date])

  async function loadGrid() {
    setLoading(true)
    setProducts([])
    setCustomers([])
    setGrid({})

    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, customer_id,
        customer:customers!inner(id, business_name),
        items:order_items(
          product_id, product_name, quantity,
          product:products(id, code, name)
        )
      `)
      .eq('delivery_date', date)
      .in('status', ['pending', 'confirmed', 'in_production'])

    if (!orders || orders.length === 0) {
      setLoading(false)
      return
    }

    const prodMap = new Map<string, { id: string; code: number; name: string }>()
    const custMap = new Map<string, { id: string; name: string; shortName: string }>()
    const gridData: Record<string, Record<string, number>> = {}

    for (const order of orders as any[]) {
      const custId = order.customer_id
      const custName = Array.isArray(order.customer)
        ? order.customer[0]?.business_name
        : order.customer?.business_name ?? 'Unknown'

      if (!custMap.has(custId)) {
        const short = custName
        custMap.set(custId, { id: custId, name: custName, shortName: short })
      }

      for (const item of (order.items ?? [])) {
        const pid = item.product_id
        const prod = Array.isArray(item.product) ? item.product[0] : item.product
        if (!pid || !prod) continue

        if (!prodMap.has(pid)) {
          prodMap.set(pid, {
            id: pid,
            code: Number(prod.code ?? 0),
            name: prod.name ?? item.product_name ?? '',
          })
        }

        if (!gridData[pid]) gridData[pid] = {}
        gridData[pid][custId] = (gridData[pid][custId] ?? 0) + item.quantity
      }
    }

    const sortedProducts = Array.from(prodMap.values()).sort((a, b) => a.code - b.code)
    const sortedCustomers = Array.from(custMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    setProducts(sortedProducts)
    setCustomers(sortedCustomers)
    setGrid(gridData)
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const hasData = products.length > 0 && customers.length > 0

  return (
    <>
           <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: landscape; margin: 8mm; }
        }
      `}</style>

      <div className="max-w-[98vw] mx-auto p-4 space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-4 no-print">
          <Link href="/admin/production" className="text-sm text-gray-500 hover:text-gray-700">← Production</Link>
          <h1 className="text-xl font-bold text-gray-900">📦 Packing Grid</h1>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm" />
          </div>
          <button onClick={() => {
            const d = new Date(); d.setDate(d.getDate() + 1)
            setDate(d.toISOString().split('T')[0])
          }} className="px-3 py-1.5 text-xs bg-gray-100 rounded hover:bg-gray-200">Tomorrow</button>
          <button onClick={() => setDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-1.5 text-xs bg-gray-100 rounded hover:bg-gray-200">Today</button>
          {hasData && (
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Printer className="h-4 w-4" /> Print
            </button>
          )}
        </div>

        {loading && <div className="text-center py-12 text-gray-400">Loading orders…</div>}

        {!loading && !hasData && (
          <div className="text-center py-12 text-gray-400">
            No orders found for {dayLabel}
          </div>
        )}

        {hasData && (
          <div id="packing-print" ref={printRef}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold">{dayLabel.split(',')[0]?.trim().toUpperCase()}</h2>
                <p className="text-xs text-gray-500">{dayLabel} — {products.length} products, {customers.length} customers</p>
              </div>
              <div className="text-xs text-gray-400 no-print">
                Printed: {new Date().toLocaleString('en-AU')}
              </div>
            </div>

            {/* Grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">                <thead>
                  <tr>
                    <th className="border border-gray-400 bg-gray-100 px-2 py-1 text-left sticky left-0 z-10 min-w-[40px]">Code</th>

                    <th className="border border-gray-400 bg-gray-100 px-1 py-1 text-left sticky left-[40px] z-10" style={{ maxWidth: '120px' }}>Product</th>                    {customers.map(c => (
                      <th key={c.id} className="border border-gray-400 bg-gray-100 px-1 py-1 text-center min-w-[28px] max-w-[28px]"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', height: '160px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {c.name}
                      </th>
                    ))}
                    {[1, 2, 3].map(n => (
                      <th key={`blank-${n}`} className="border border-gray-400 bg-yellow-50 px-1 py-1 text-center min-w-[28px] max-w-[28px]"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', height: '140px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', color: '#999' }}>
                      </th>
                    ))}
                    <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-center font-bold min-w-[40px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => {
                    const rowTotal = customers.reduce((sum, c) => sum + (grid[p.id]?.[c.id] ?? 0), 0)
                    if (rowTotal === 0) return null
                    return (
                      <tr key={p.id} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                                              <td className="border border-gray-300 px-2 py-1 font-mono text-sm sticky left-0 bg-inherit z-10">{p.code}</td>
                                             <td className="border border-gray-300 px-1 py-1 font-semibold sticky left-[40px] bg-inherit z-10 text-xs" style={{ maxWidth: '180px' }}>
                          {p.name}
                        </td>
                        {customers.map(c => {
                          const qty = grid[p.id]?.[c.id] ?? 0
                          return (
                            <td key={c.id} className={`border border-gray-300 px-1 py-1 text-center text-sm ${qty > 0 ? 'font-bold' : 'text-gray-200'}`}>                              {qty > 0 ? qty : ''}
                            </td>
                          )
                        })}
                        {[1, 2, 3].map(n => (
                          <td key={`blank-${n}`} className="border border-gray-300 bg-yellow-50 px-1 py-1"></td>
                        ))}
                        <td className="border border-gray-400 px-2 py-1 text-center font-bold bg-gray-100">{rowTotal}</td>                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 text-white font-bold">
                    <td colSpan={2} className="border border-gray-600 px-2 py-1 sticky left-0 z-10 bg-gray-800">Customer Total</td>
                    {customers.map(c => {
                      const custTotal = products.reduce((sum, p) => sum + (grid[p.id]?.[c.id] ?? 0), 0)
                      return (
                        <td key={c.id} className="border border-gray-600 px-1 py-1 text-center text-sm">                          {custTotal > 0 ? custTotal : ''}
                        </td>
                      )
                    })}
                    {[1, 2, 3].map(n => (
                      <td key={`blank-${n}`} className="border border-gray-600 bg-yellow-50 px-1 py-1"></td>
                    ))}
                    <td className="border border-gray-600 px-2 py-1 text-center">                      {products.reduce((sum, p) => sum + customers.reduce((s, c) => s + (grid[p.id]?.[c.id] ?? 0), 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}