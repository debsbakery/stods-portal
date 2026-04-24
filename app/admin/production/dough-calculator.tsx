'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calculator, Printer, ChevronDown, ChevronUp, AlertCircle, Calendar } from 'lucide-react'

interface RollLine {
  productName: string
  productCode: string
  ordered: number
  perTray: number
  trays: number
  totalPieces: number
  doughWeightG: number
  doughKg: number
  doughType: string
}

interface BreadLine {
  productName: string
  productCode: string
  ordered: number
  doughWeightG: number
  doughKg: number
  doughType: string
}

interface DoughSummary {
  doughType: string
  rollKg: number
  breadKg: number
  rollWithSafety: number
  breadWithSafety: number
}

const SAFETY_MARGIN = 0.05

// ── Constants for White Dough split rules ────────────────────────────────────
const FLOUR_RATIO              = 0.60   // flour = 60% of dough weight (rolls)
const MAX_FLOUR_PER_DOUGH_ROLL = 30     // kg flour per dough (rolls)
const MAX_KG_PER_DOUGH_BREAD   = 100    // kg dough per dough (bread)

const fmt = (n: number) => n.toFixed(1)
const fmt2 = (n: number) => n.toFixed(2)

function getWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })
}

// ── White Dough Split Helpers ────────────────────────────────────────────────

// Is this a white dough (case-insensitive match)
function isWhiteDough(doughType: string): boolean {
  return doughType.trim().toLowerCase() === 'white'
}

// Rolls: split by flour (max 30 kg flour per dough)
// Returns { numDoughs, kgPerDough, flourKg, flourPerDough } or null if not applicable
function calcRollSplit(totalDoughKg: number) {
  if (totalDoughKg <= 0) return null
  const flourKg       = totalDoughKg * FLOUR_RATIO
  const numDoughs     = Math.max(1, Math.ceil(flourKg / MAX_FLOUR_PER_DOUGH_ROLL))
  const kgPerDough    = totalDoughKg / numDoughs
  const flourPerDough = flourKg / numDoughs
  return { numDoughs, kgPerDough, flourKg, flourPerDough }
}

// Bread: split by dough weight (max 100 kg per dough)
function calcBreadSplit(totalDoughKg: number) {
  if (totalDoughKg <= 0) return null
  const numDoughs  = Math.max(1, Math.ceil(totalDoughKg / MAX_KG_PER_DOUGH_BREAD))
  const kgPerDough = totalDoughKg / numDoughs
  const flourKg    = totalDoughKg * FLOUR_RATIO
  return { numDoughs, kgPerDough, flourKg }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DoughCalculator() {
  const supabase = createClient()
  const printRef = useRef<HTMLDivElement>(null)

  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom]         = useState(today)
  const [dateTo, setDateTo]             = useState(today)
  const [loading, setLoading]           = useState(false)
  const [rollLines, setRollLines]       = useState<RollLine[]>([])
  const [breadLines, setBreadLines]     = useState<BreadLine[]>([])
  const [summaries, setSummaries]       = useState<DoughSummary[]>([])
  const [unconfigured, setUnconfigured] = useState<string[]>([])
  const [showDetail, setShowDetail]     = useState(true)
  const [orderCount, setOrderCount]     = useState(0)

  function setToday() {
    const t = new Date().toISOString().split('T')[0]
    setDateFrom(t)
    setDateTo(t)
  }

  function setTomorrow() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const t = d.toISOString().split('T')[0]
    setDateFrom(t)
    setDateTo(t)
  }

  function setNextTwoDays() {
    const d1 = new Date()
    d1.setDate(d1.getDate() + 1)
    const d2 = new Date()
    d2.setDate(d2.getDate() + 2)
    setDateFrom(d1.toISOString().split('T')[0])
    setDateTo(d2.toISOString().split('T')[0])
  }

  async function loadCalculation() {
    setLoading(true)
    setRollLines([])
    setBreadLines([])
    setSummaries([])
    setUnconfigured([])
    setOrderCount(0)

    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'pending')
        .gte('delivery_date', dateFrom)
        .lte('delivery_date', dateTo)

      if (!orders || orders.length === 0) {
        setLoading(false)
        return
      }

      setOrderCount(orders.length)
      const orderIds = orders.map(o => o.id)

      const { data: items } = await supabase
        .from('order_items')
        .select(`
          product_id,
          product_name,
          quantity,
          products (
            id,
            name,
            code,
            pieces_per_tray,
            dough_weight_grams,
            production_type
          )
        `)
        .in('order_id', orderIds)

      if (!items || items.length === 0) {
        setLoading(false)
        return
      }

      const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))]

      const { data: recipes } = await supabase
        .from('recipes')
        .select('product_id, dough_type')
        .in('product_id', productIds)

      const recipeMap: Record<string, string> = {}
      if (recipes) {
        recipes.forEach((r: any) => {
          if (r.dough_type) recipeMap[r.product_id] = r.dough_type
        })
      }

      const productTotals: Record<string, { name: string; code: string; qty: number; product: any }> = {}

      items.forEach((item: any) => {
        const pid  = item.product_id
        const prod = item.products
        if (!pid || !prod) return
        if (!prod.production_type) return

        if (!productTotals[pid]) {
          productTotals[pid] = {
            name:    prod.name || item.product_name,
            code:    prod.code || '',
            qty:     0,
            product: prod,
          }
        }
        productTotals[pid].qty += Math.abs(item.quantity)
      })

      const rolls: RollLine[]   = []
      const breads: BreadLine[] = []
      const missing: string[]   = []

      Object.entries(productTotals).forEach(([pid, data]) => {
        const prod      = data.product
        const doughType = recipeMap[pid] || 'Unknown'
        const weightG   = prod.dough_weight_grams

        if (!weightG || weightG <= 0) {
          missing.push(`${data.code} ${data.name} — no dough weight`)
          return
        }

        if (prod.production_type === 'roll') {
          const perTray = prod.pieces_per_tray
          if (!perTray || perTray <= 0) {
            missing.push(`${data.code} ${data.name} — no pieces/tray`)
            return
          }
          const trays       = Math.ceil(data.qty / perTray)
          const totalPieces = trays * perTray
          const doughKg     = (totalPieces * weightG) / 1000

          rolls.push({
            productName: data.name, productCode: data.code,
            ordered: data.qty, perTray, trays, totalPieces,
            doughWeightG: weightG, doughKg, doughType,
          })
        } else if (prod.production_type === 'bread') {
          const doughKg = (data.qty * weightG) / 1000
          breads.push({
            productName: data.name, productCode: data.code,
            ordered: data.qty, doughWeightG: weightG, doughKg, doughType,
          })
        }
      })

      rolls.sort((a, b) => a.doughType.localeCompare(b.doughType) || a.productCode.localeCompare(b.productCode))
      breads.sort((a, b) => a.doughType.localeCompare(b.doughType) || a.productCode.localeCompare(b.productCode))

      const doughTotals: Record<string, { rollKg: number; breadKg: number }> = {}

      rolls.forEach(r => {
        if (!doughTotals[r.doughType]) doughTotals[r.doughType] = { rollKg: 0, breadKg: 0 }
        doughTotals[r.doughType].rollKg += r.doughKg
      })
      breads.forEach(b => {
        if (!doughTotals[b.doughType]) doughTotals[b.doughType] = { rollKg: 0, breadKg: 0 }
        doughTotals[b.doughType].breadKg += b.doughKg
      })

      const summaryList: DoughSummary[] = Object.entries(doughTotals)
        .map(([doughType, totals]) => ({
          doughType,
          rollKg:          totals.rollKg,
          breadKg:         totals.breadKg,
          rollWithSafety:  totals.rollKg  * (1 + SAFETY_MARGIN),
          breadWithSafety: totals.breadKg * (1 + SAFETY_MARGIN),
        }))
        .sort((a, b) => a.doughType.localeCompare(b.doughType))

      setRollLines(rolls)
      setBreadLines(breads)
      setSummaries(summaryList)
      setUnconfigured(missing)

    } catch (err) {
      console.error('Dough calculator error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) {
      loadCalculation()
    }
  }, [dateFrom, dateTo])

  function handlePrint() {
    const printContent = printRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Dough Calculator — ${dateRangeDisplay}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            h2 { font-size: 14px; margin-top: 16px; margin-bottom: 6px; border-bottom: 2px solid #333; padding-bottom: 2px; }
            .date { font-size: 13px; color: #555; margin-bottom: 12px; }
            .orders { font-size: 11px; color: #777; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .summary-box {
              display: inline-block; border: 2px solid #333; padding: 12px 20px;
              margin: 8px 16px 8px 0; min-width: 240px; vertical-align: top;
            }
            .summary-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; }
            .make-line { font-size: 15px; font-weight: bold; border-top: 2px solid #333; padding-top: 4px; margin-top: 6px; }
            .split-box {
              margin-top: 6px; padding: 6px 8px; background: #f7f7f7;
              border-left: 3px solid #333; font-size: 11px;
            }
            .split-box .split-title { font-weight: bold; margin-bottom: 3px; }
            .timestamp { margin-top: 20px; font-size: 10px; color: #999; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <h1>Dough Production Calculator</h1>
          <div class="date">${dateRangeDisplay}</div>
          <div class="orders">${orderCount} pending order${orderCount !== 1 ? 's' : ''}</div>
          ${printContent.innerHTML}
          <div class="timestamp">Printed: ${new Date().toLocaleString('en-AU')}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const isSingleDay = dateFrom === dateTo
  const dateRangeDisplay = isSingleDay
    ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : `${getWeekday(dateFrom)} ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — ${getWeekday(dateTo)} ${new Date(dateTo + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const hasData = rollLines.length > 0 || breadLines.length > 0

  return (
    <div>
      {/* ── Controls ── */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="h-3.5 w-3.5 inline mr-1" />
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value)
                if (e.target.value > dateTo) setDateTo(e.target.value)
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="h-3.5 w-3.5 inline mr-1" />
              To
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:outline-none text-sm"
            />
          </div>

          <div className="flex gap-1.5">
            <button onClick={setToday}
              className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
              Today
            </button>
            <button onClick={setTomorrow}
              className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
              Tomorrow
            </button>
            <button onClick={setNextTwoDays}
              className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
              Next 2 Days
            </button>
          </div>

          <button
            onClick={loadCalculation}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 transition-colors text-sm"
          >
            <Calculator className="h-4 w-4" />
            {loading ? 'Calculating...' : 'Recalculate'}
          </button>

          {hasData && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              <Printer className="h-4 w-4" /> Print for Bakers
            </button>
          )}
        </div>

        <div className="mt-3 text-sm text-gray-500">
          📅 {dateRangeDisplay}
          {orderCount > 0 && (
            <span className="ml-3 text-green-700 font-semibold">
              {orderCount} pending order{orderCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Warnings ── */}
      {unconfigured.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Products missing production data</p>
              <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
                {unconfigured.map((name, idx) => (
                  <li key={idx}>{name}</li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                Use <a href="/admin/products/bulk-weights" className="underline font-semibold">Bulk Production Setup</a> to configure.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !hasData && (
        <div className="text-center py-12 text-gray-400">
          <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">No bread/roll orders found</p>
          <p className="text-sm mt-1">for {dateRangeDisplay}</p>
          <p className="text-xs mt-2">
            Make sure products have <strong>production_type</strong> set to &quot;roll&quot; or &quot;bread&quot;
          </p>
        </div>
      )}

      {/* ── Printable Content ── */}
      {hasData && (
        <div ref={printRef}>

          {/* ── DOUGH SUMMARY ── */}
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#006A4E' }}>
              🧮 Dough Required — {dateRangeDisplay}
            </h2>
            <div className="flex flex-wrap gap-4">
              {summaries.map(s => {
                const isWhite    = isWhiteDough(s.doughType)

                // Compute splits only for white dough
                const rollSplit  = isWhite && s.rollWithSafety  > 0 ? calcRollSplit(s.rollWithSafety)   : null
                const breadSplit = isWhite && s.breadWithSafety > 0 ? calcBreadSplit(s.breadWithSafety) : null

                return (
                  <div key={s.doughType} className="border-2 border-gray-800 rounded-lg p-5 min-w-[280px]">
                    <div className="text-sm font-bold uppercase tracking-wide text-gray-600 mb-3">
                      {s.doughType} Dough
                    </div>

                    {/* ── Roll dough block ── */}
                    {s.rollKg > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">🥖 Roll dough:</span>
                          <span className="font-semibold">{fmt(s.rollKg)} kg</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold mt-1 pt-1 border-t border-gray-300"
                          style={{ color: '#006A4E' }}>
                          <span>MAKE Rolls:</span>
                          <span>{fmt(s.rollWithSafety)} kg</span>
                        </div>
                        <div className="text-xs text-gray-400 text-right">incl. 5% safety</div>

                        {/* White Rolls: flour weight + dough split (hide if 1 dough) */}
                        {isWhite && rollSplit && (
                          <div className="mt-2 pl-2 border-l-4 border-amber-400 bg-amber-50 rounded-r py-2 pr-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Flour weight (60%):</span>
                              <span className="font-semibold">{fmt(rollSplit.flourKg)} kg</span>
                            </div>
                            {rollSplit.numDoughs > 1 && (
                              <div className="mt-2 pt-2 border-t border-amber-200">
                                <div className="text-xs font-bold text-amber-800 mb-1">
                                  Split into {rollSplit.numDoughs} doughs:
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-600">Dough size each:</span>
                                  <span className="font-semibold">{fmt2(rollSplit.kgPerDough)} kg</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-600">Flour each:</span>
                                  <span className="font-semibold">{fmt2(rollSplit.flourPerDough)} kg</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Bread dough block ── */}
                    {s.breadKg > 0 && (
                      <div className={s.rollKg > 0 ? 'pt-3 border-t-2 border-gray-300' : ''}>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">🍞 Bread dough:</span>
                          <span className="font-semibold">{fmt(s.breadKg)} kg</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold mt-1 pt-1 border-t border-gray-300"
                          style={{ color: '#006A4E' }}>
                          <span>MAKE Bread:</span>
                          <span>{fmt(s.breadWithSafety)} kg</span>
                        </div>
                        <div className="text-xs text-gray-400 text-right">incl. 5% safety</div>

                        {/* White Bread: flour weight (one line) + dough split (hide if 1 dough) */}
                        {isWhite && breadSplit && (
                          <div className="mt-2 pl-2 border-l-4 border-amber-400 bg-amber-50 rounded-r py-2 pr-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Flour weight (60%):</span>
                              <span className="font-semibold">{fmt(breadSplit.flourKg)} kg</span>
                            </div>
                            {breadSplit.numDoughs > 1 && (
                              <div className="mt-2 pt-2 border-t border-amber-200">
                                <div className="text-xs font-bold text-amber-800 mb-1">
                                  Split into {breadSplit.numDoughs} doughs:
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-600">Dough size each:</span>
                                  <span className="font-semibold">{fmt2(breadSplit.kgPerDough)} kg</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {s.rollKg > 0 && s.breadKg > 0 && (
                      <div className="mt-3 pt-2 border-t-2 border-gray-800 flex justify-between text-sm text-gray-500">
                        <span>Combined {s.doughType}:</span>
                        <span className="font-semibold">{fmt(s.rollWithSafety + s.breadWithSafety)} kg</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={() => setShowDetail(!showDetail)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            {showDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDetail ? 'Hide detail breakdown' : 'Show detail breakdown'}
          </button>

          {showDetail && rollLines.length > 0 && (
            <div className="mb-6">
              <h3 className="text-md font-bold mb-2 text-gray-700">🥖 Rolls Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-3 py-2 text-left">Code</th>
                      <th className="border px-3 py-2 text-left">Product</th>
                      <th className="border px-3 py-2 text-left">Dough</th>
                      <th className="border px-3 py-2 text-right">Ordered</th>
                      <th className="border px-3 py-2 text-right">Per Tray</th>
                      <th className="border px-3 py-2 text-right">Trays</th>
                      <th className="border px-3 py-2 text-right">Total Pcs</th>
                      <th className="border px-3 py-2 text-right">g/piece</th>
                      <th className="border px-3 py-2 text-right font-bold">Dough kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollLines.map((r, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border px-3 py-1.5 font-mono text-xs">{r.productCode}</td>
                        <td className="border px-3 py-1.5">{r.productName}</td>
                        <td className="border px-3 py-1.5">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{r.doughType}</span>
                        </td>
                        <td className="border px-3 py-1.5 text-right">{r.ordered}</td>
                        <td className="border px-3 py-1.5 text-right">{r.perTray}</td>
                        <td className="border px-3 py-1.5 text-right font-semibold">{r.trays}</td>
                        <td className="border px-3 py-1.5 text-right">{r.totalPieces}</td>
                        <td className="border px-3 py-1.5 text-right text-gray-500">{r.doughWeightG}g</td>
                        <td className="border px-3 py-1.5 text-right font-bold">{fmt(r.doughKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showDetail && breadLines.length > 0 && (
            <div className="mb-6">
              <h3 className="text-md font-bold mb-2 text-gray-700">🍞 Bread Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-3 py-2 text-left">Code</th>
                      <th className="border px-3 py-2 text-left">Product</th>
                      <th className="border px-3 py-2 text-left">Dough</th>
                      <th className="border px-3 py-2 text-right">Ordered</th>
                      <th className="border px-3 py-2 text-right">g/loaf</th>
                      <th className="border px-3 py-2 text-right font-bold">Dough kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breadLines.map((b, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border px-3 py-1.5 font-mono text-xs">{b.productCode}</td>
                        <td className="border px-3 py-1.5">{b.productName}</td>
                        <td className="border px-3 py-1.5">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{b.doughType}</span>
                        </td>
                        <td className="border px-3 py-1.5 text-right">{b.ordered}</td>
                        <td className="border px-3 py-1.5 text-right text-gray-500">{b.doughWeightG}g</td>
                        <td className="border px-3 py-1.5 text-right font-bold">{fmt(b.doughKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}