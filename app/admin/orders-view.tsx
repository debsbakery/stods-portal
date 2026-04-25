'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Package, FileDown, FileText, Calendar, ChevronDown, ChevronRight, X } from 'lucide-react'

interface OrderItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface Order {
  id: string
  customer_email: string
  customer_business_name: string | null
  delivery_date: string
  notes: string | null
  status: string
  total_amount: number | null
  source: string | null
  created_at: string
  order_items: OrderItem[]
}

interface Stats {
  totalOrders: number
  pendingOrders: number
  totalRevenue: number
  todayOrders: number
}

const DAY_COLORS: Record<string, string> = {
  '0': 'bg-red-100 text-red-800 border-red-200',
  '1': 'bg-blue-100 text-blue-800 border-blue-200',
  '2': 'bg-green-100 text-green-800 border-green-200',
  '3': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  '4': 'bg-purple-100 text-purple-800 border-purple-200',
  '5': 'bg-pink-100 text-pink-800 border-pink-200',
  '6': 'bg-orange-100 text-orange-800 border-orange-200',
}

function getBrisbaneToday(): string {
  const brisbane = new Date(Date.now() + 10 * 60 * 60 * 1000)
  return brisbane.toISOString().split('T')[0]
}

function getBrisbaneTomorrow(): string {
  const brisbane = new Date(Date.now() + 10 * 60 * 60 * 1000)
  brisbane.setUTCDate(brisbane.getUTCDate() + 1)
  return brisbane.toISOString().split('T')[0]
}

function getInitialWeekOffset(): number {
  const today    = getBrisbaneToday()
  const todayDay = new Date(today + 'T12:00:00Z').getUTCDay()
  return todayDay === 0 ? 1 : 0
}

export default function OrdersView() {
  const supabase = createClient()

  const [orders, setOrders]             = useState<Order[]>([])
  const [stats, setStats]               = useState<Stats>({
    totalOrders: 0, pendingOrders: 0, totalRevenue: 0, todayOrders: 0,
  })
  const [loading, setLoading]           = useState(true)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [weekOffset, setWeekOffset]     = useState(getInitialWeekOffset)
  const [cancelling, setCancelling]     = useState<string | null>(null)

  useEffect(() => {
    loadOrders()
    loadStats()
  }, [weekOffset])

  useEffect(() => {
    const tomorrow = getBrisbaneTomorrow()
    setExpandedDays(new Set([tomorrow]))
  }, [orders])

  function getWeekRange(offset: number) {
    const today     = getBrisbaneToday()
    const d         = new Date(today + 'T12:00:00Z')
    const dayOfWeek = d.getUTCDay()

    const startOfWeek = new Date(d)
    startOfWeek.setUTCDate(d.getUTCDate() - dayOfWeek + offset * 7)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6)

    return {
      start: startOfWeek.toISOString().split('T')[0],
      end:   endOfWeek.toISOString().split('T')[0],
    }
  }

  async function loadOrders() {
    const { start, end } = getWeekRange(weekOffset)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .gte('delivery_date', start)
      .lte('delivery_date', end)
      .order('delivery_date', { ascending: true })
      .order('customer_business_name', { ascending: true })

    if (data) setOrders(data as Order[])
    setLoading(false)
  }

  async function loadStats() {
    // ✅ Total Orders — exclude cancelled
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'cancelled')

    // ✅ Pending — already filtered correctly
    const { count: pendingOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    // ✅ Total Revenue — exclude cancelled
    const { data: revenueData } = await supabase
      .from('orders')
      .select('total_amount')
      .not('total_amount', 'is', null)
      .neq('status', 'cancelled')

    const totalRevenue = revenueData?.reduce(
      (sum, o) => sum + (o.total_amount || 0), 0
    ) || 0

    // ✅ Delivering Today — exclude cancelled
    const today = getBrisbaneToday()
    const { count: todayOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('delivery_date', today)
      .neq('status', 'cancelled')

    setStats({
      totalOrders:   totalOrders   || 0,
      pendingOrders: pendingOrders || 0,
      totalRevenue,
      todayOrders:   todayOrders   || 0,
    })
  }

  async function cancelOrder(orderId: string, customerName: string) {
    if (!confirm(`Cancel order for ${customerName}? This cannot be undone.`)) return
    setCancelling(orderId)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to cancel order')
      }
      await loadOrders()
      await loadStats()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setCancelling(null)
    }
  }

  const ordersByDate = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const date = order.delivery_date
    if (!acc[date]) acc[date] = []
    acc[date].push(order)
    return acc
  }, {})

  const sortedDates = Object.keys(ordersByDate).sort()

  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function expandAll()   { setExpandedDays(new Set(sortedDates)) }
  function collapseAll() { setExpandedDays(new Set()) }

  const { start, end } = getWeekRange(weekOffset)

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'short',
      })
    } catch { return dateStr }
  }

  const formatWeekDate = (dateStr: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', opts)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)

  const getDayColor = (dateStr: string) => {
    const day = new Date(dateStr + 'T12:00:00Z').getUTCDay().toString()
    return DAY_COLORS[day] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const isToday = (dateStr: string) => dateStr === getBrisbaneToday()

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending:   'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      invoiced:  'bg-gray-100 text-gray-600',
      cancelled: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Package className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-600">Loading orders...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4" style={{ borderColor: '#8B0000' }}>
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-3xl font-bold">{stats.totalOrders}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4" style={{ borderColor: '#2c2c2c' }}>
          <p className="text-sm text-gray-600">Pending</p>
          <p className="text-3xl font-bold" style={{ color: '#8B0000' }}>{stats.pendingOrders}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4 border-blue-500">
          <p className="text-sm text-gray-600">Delivering Today</p>
          <p className="text-3xl font-bold text-blue-600">{stats.todayOrders}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-600">Total Revenue</p>
          <p className="text-2xl font-bold text-yellow-700">{formatCurrency(stats.totalRevenue)}</p>
        </div>
      </div>

      {/* Week Navigator */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm font-medium"
            >
              Prev Week
            </button>
            <div className="text-center">
              <p className="font-semibold text-gray-800">
                {weekOffset === 0  ? 'This Week'  :
                 weekOffset === 1  ? 'Next Week'  :
                 weekOffset === -1 ? 'Last Week'  :
                 `Week of ${start}`}
              </p>
              <p className="text-xs text-gray-500">
                {formatWeekDate(start, { day: 'numeric', month: 'short' })} —{' '}
                {formatWeekDate(end,   { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm font-medium"
            >
              Next Week
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm font-medium text-blue-600"
              >
                Today
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">
              Expand All
            </button>
            <button onClick={collapseAll}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Orders grouped by day */}
      {sortedDates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-400">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No orders for this week</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map(date => {
            const dayOrders  = ordersByDate[date]
            const isExpanded = expandedDays.has(date)
            const dayTotal   = dayOrders
              .filter(o => o.status !== 'cancelled')
              .reduce((sum, o) => sum + (o.total_amount || 0), 0)
            const colorClass = getDayColor(date)
            const today      = isToday(date)

            return (
              <div
                key={date}
                className={`bg-white rounded-lg shadow-md overflow-hidden border ${
                  today ? 'border-blue-400' : 'border-transparent'
                }`}
              >
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(date)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown  className="h-5 w-5 text-gray-400" />
                      : <ChevronRight className="h-5 w-5 text-gray-400" />
                    }
                    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${colorClass}`}>
                      {formatDate(date)}
                    </span>
                    {today && (
                      <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
                        TODAY
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {dayOrders.length} order{dayOrders.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="font-bold text-lg" style={{ color: '#2c2c2c' }}>
                    {formatCurrency(dayTotal)}
                  </span>
                </button>

                {/* Day Orders Table */}
                {isExpanded && (
                  <div className="border-t">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Customer</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Items</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {dayOrders.map(order => (
                          <tr key={order.id}
                            className={`hover:bg-gray-50 ${order.status === 'cancelled' ? 'opacity-50' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm">
                                {order.customer_business_name || '—'}
                              </p>
                              <p className="text-xs text-gray-400">{order.customer_email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm space-y-0.5">
                                {order.order_items.slice(0, 2).map((item, idx) => (
                                  <p key={idx} className="text-gray-600 truncate max-w-48">
                                    <span className="font-semibold">{item.quantity}x</span>{' '}
                                    {item.product_name}
                                  </p>
                                ))}
                                {order.order_items.length > 2 && (
                                  <p className="text-xs text-gray-400">
                                    +{order.order_items.length - 2} more
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-sm">
                              {formatCurrency(order.total_amount || 0)}
                            </td>
                            <td className="px-4 py-3">
                              {getStatusBadge(order.status)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-center flex-wrap">
                                <a
                                  href={`/admin/orders/${order.id}/edit`}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                  <FileText className="h-3 w-3" />Edit
                                </a>
                                <a
                                  href={`/api/invoice/${order.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded text-white hover:opacity-90"
                                  style={{ backgroundColor: '#8B0000' }}
                                >
                                  <FileDown className="h-3 w-3" />Inv
                                </a>
                                <a
                                  href={`/api/packing-slip/${order.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded text-white hover:opacity-90"
                                  style={{ backgroundColor: '#2c2c2c' }}
                                >
                                  <Package className="h-3 w-3" />Slip
                                </a>

                                {order.status !== 'cancelled' && order.status !== 'invoiced' && (
                                  <button
                                    onClick={() => cancelOrder(
                                      order.id,
                                      order.customer_business_name || order.customer_email
                                    )}
                                    disabled={cancelling === order.id}
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                  >
                                    <X className="h-3 w-3" />
                                    {cancelling === order.id ? '...' : 'Cancel'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t">
                        <tr>
                          <td colSpan={2}
                            className="px-4 py-2 text-sm font-semibold text-gray-600 text-right">
                            Day Total
                          </td>
                          <td className="px-4 py-2 text-right font-bold" style={{ color: '#2c2c2c' }}>
                            {formatCurrency(dayTotal)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}