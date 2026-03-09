'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface StaleItem {
  id: string
  product_name: string | null
  product_code: string | null
  quantity: number
  unit_price: number
  credit_percent: number
  line_total: number
  credit_type: string
  credit_memo: {
    id: string
    credit_number: string
    credit_date: string
    status: string
    customer: {
      id: string
      business_name: string
      contact_name: string
    } | null
  } | null
}

interface ProductSummary {
  product_name: string
  product_code: string
  total_quantity: number
  total_value: number
  total_sold: number
  total_revenue: number
}

interface CustomerSummary {
  customer_id: string
  business_name: string
  total_quantity: number
  total_value: number
  total_sold: number
}

interface Props {
  items: StaleItem[]
  byProduct: ProductSummary[]
  byCustomer: CustomerSummary[]
  totalValue: number
  totalQty: number
  fromDate: string
  toDate: string
}

type TabType = 'summary' | 'by_product' | 'by_customer' | 'detail'

function stalePercent(staleQty: number, soldQty: number): string {
  if (soldQty <= 0) return '—'
  return ((staleQty / soldQty) * 100).toFixed(1) + '%'
}

function stalePercentNum(staleQty: number, soldQty: number): number {
  if (soldQty <= 0) return 0
  return (staleQty / soldQty) * 100
}

export default function StalesReportView({
  items,
  byProduct,
  byCustomer,
  totalValue,
  totalQty,
  fromDate,
  toDate,
}: Props) {
  const router = useRouter()
  const [tab, setTab]   = useState<TabType>('summary')
  const [from, setFrom] = useState(fromDate)
  const [to, setTo]     = useState(toDate)

  function applyFilter() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    router.push('/admin/reports/stales?' + params.toString())
  }

  function clearFilter() {
    setFrom('')
    setTo('')
    router.push('/admin/reports/stales')
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'summary',     label: 'Summary' },
    { key: 'by_product',  label: 'By Product' },
    { key: 'by_customer', label: 'By Customer' },
    { key: 'detail',      label: 'Detail Lines' },
  ]

  const totalSold = byProduct.reduce((s, p) => s + p.total_sold, 0)

  return (
    <div className="space-y-6">

      {/* Date Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <button
            onClick={applyFilter}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: '#006A4E' }}
          >
            Apply
          </button>
          {(from || to) && (
            <button
              onClick={clearFilter}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
          {(from || to) && (
            <p className="text-xs text-gray-500 self-center">
              Filtered: {from || 'start'} to {to || 'today'}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Total Stale Value
          </p>
          <p className="text-3xl font-bold text-red-600 mt-1">
            ${totalValue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Units Returned
          </p>
          <p className="text-3xl font-bold text-gray-800 mt-1">
            {totalQty.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Units Sold
          </p>
          <p className="text-3xl font-bold text-gray-800 mt-1">
            {totalSold.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Overall Stale Rate
          </p>
          <p className={
            'text-3xl font-bold mt-1 ' +
            (stalePercentNum(totalQty, totalSold) > 10
              ? 'text-red-600'
              : 'text-green-600')
          }>
            {stalePercent(totalQty, totalSold)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ' +
                (tab === t.key
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Summary */}
      {tab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-bold text-gray-800">Top Stale Products</h3>
            </div>
            {byProduct.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No stale data found</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Sold</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Stale</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byProduct.slice(0, 8).map((p) => {
                    const pct = stalePercentNum(p.total_quantity, p.total_sold)
                    return (
                      <tr key={p.product_name} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{p.product_name}</span>
                          {p.product_code && (
                            <span className="ml-2 text-xs text-gray-400 font-mono">#{p.product_code}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 font-mono">
                          {p.total_sold}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                          {p.total_quantity.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={
                            'font-bold text-xs px-2 py-0.5 rounded-full ' +
                            (pct > 20
                              ? 'bg-red-100 text-red-700'
                              : pct > 10
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700')
                          }>
                            {stalePercent(p.total_quantity, p.total_sold)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-bold text-gray-800">Top Customers by Stale Value</h3>
            </div>
            {byCustomer.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No stale data found</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Customer</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Units</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byCustomer.slice(0, 8).map((c) => (
                    <tr key={c.customer_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{c.business_name}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                        {c.total_quantity.toFixed(0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                        ${c.total_value.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: By Product */}
      {tab === 'by_product' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Product</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Sold</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Stale Units</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Stale %</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Stale Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byProduct.map((p) => {
                const pct = stalePercentNum(p.total_quantity, p.total_sold)
                return (
                  <tr key={p.product_name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                      {p.product_code || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {p.total_sold}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">
                      {p.total_quantity.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={
                        'font-bold text-xs px-2 py-0.5 rounded-full ' +
                        (pct > 20
                          ? 'bg-red-100 text-red-700'
                          : pct > 10
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700')
                      }>
                        {stalePercent(p.total_quantity, p.total_sold)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      ${p.total_value.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-bold text-gray-800">Total</td>
                <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                  {totalSold}
                </td>
                <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                  {totalQty.toFixed(0)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={
                    'font-bold text-xs px-2 py-0.5 rounded-full ' +
                    (stalePercentNum(totalQty, totalSold) > 10
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700')
                  }>
                    {stalePercent(totalQty, totalSold)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  ${totalValue.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab: By Customer */}
      {tab === 'by_customer' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Customer</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Stale Units</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Stale Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byCustomer.map((c) => (
                <tr key={c.customer_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.business_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    {c.total_quantity.toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">
                    ${c.total_value.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={'/admin/ar/' + c.customer_id}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      View Ledger
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td className="px-4 py-3 font-bold text-gray-800">Total</td>
                <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                  {totalQty.toFixed(0)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  ${totalValue.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab: Detail Lines */}
      {tab === 'detail' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Memo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Product</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Unit Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Credit %</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const memo = item.credit_memo as any
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">
                      {memo?.credit_date ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-indigo-600">
                      {memo?.credit_number ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">
                      {memo?.customer?.business_name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {item.product_name ?? '—'}
                      {item.product_code && (
                        <span className="ml-1.5 text-xs text-gray-400 font-mono">
                          #{item.product_code}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                      {Number(item.quantity).toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      ${Number(item.unit_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {Number(item.credit_percent).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">
                      ${Math.abs(Number(item.line_total)).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td colSpan={7} className="px-4 py-3 font-bold text-gray-800">Total</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  ${totalValue.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  )
}