'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Package, FileDown, FileText, Calendar, TrendingUp, DollarSign, ChevronDown, ChevronRight } from 'lucide-react'

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
  '0': 'bg-red-100 text-red-800 border-red-200',     // Sun
  '1': 'bg-blue-100 text-blue-800 border-blue-200',   // Mon
  '2': 'bg-green-100 text-green-800 border-green-200',// Tue
  '3': 'bg-yellow-100 text-yellow-800 border-yellow-200', // Wed
  '4': 'bg-purple-100 text-purple-800 border-purple-200', // Thu
  '5': 'bg-pink-100 text-pink-800 border-pink-200',   // Fri
  '6': 'bg-orange-100 text-orange-800 border-orange-200', // Sat
}

export default function OrdersView() {
  const supabase = createClient()
  const [orders, setOrders]   = useState<Order[]>([])
  const [stats, setStats]     = useState<Stats>({
    totalOrders: 0, pendingOrders: 0, totalRevenue: 0, todayOrders: 0
  })
  const [loading, setLoading]       = useState(true)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week

  useEffect(() => {
    loadOrders()
    loadStats()
  }, [weekOffset])

  function getWeekRange(offset: number) {
    const now = new Date()
    const day = now.getDay() // 0=Sun
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - day + offset * 7)
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    return {
      start: startOfWeek.toISOString().split('T')[0],
      end: endOfWeek.toISOString().split('T')[0],
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
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })

    const { count: pendingOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    const { data: revenueData } = await supabase
      .from('orders')
      .select('total_amount')
      .not('total_amount', 'is', null)

    const totalRevenue = revenueData?.reduce(
      (sum, o) => sum + (o.total_amount || 0), 0
    ) || 0

    const today = new Date().toISOString().split('T')[0]
    const { count: todayOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('delivery_date', today)

    setStats({
      totalOrders: totalOrders || 0,
      pendingOrders: pendingOrders || 0,
      totalRevenue,
      todayOrders: todayOrders || 0,
    })
  }

  // Group orders by delivery_date
  const ordersByDate = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const date = order.delivery_date
    if (!acc[date]) acc[date] = []
    acc[date].push(order)
    return acc
  }, {})

  const sortedDates = Object.keys(ordersByDate).sort()

  // Auto-expand today and tomorrow
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    setExpandedDays(new Set([today, tomorrowStr]))
  }, [orders])

  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function expandAll() {
    setExpandedDays(new Set(sortedDates))
  }

  function collapseAll() {
    setExpandedDays(new Set())
  }

  const { start, end } = getWeekRange(weekOffset)

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'short'
      })
    } catch { return dateStr }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)

  const getDayColor = (dateStr: string) => {
    const day = new Date(dateStr + 'T00:00:00').getDay().toString()
    return DAY_COLORS[day] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const isToday = (dateStr: string) => {
    return dateStr === new Date().toISOString().split('T')[0]
  }

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
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
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
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4" style={{ borderColor: '#CE1126' }}>
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-3xl font-bold">{stats.totalOrders}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4" style={{ borderColor: '#006A4E' }}>
          <p className="text-sm text-gray-600">Pending</p>
          <p className="text-3xl font-bold" style={{ color: '#CE1126' }}>{stats.pendingOrders}</p>
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
                {weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : weekOffset === -1 ? 'Last Week' : `Week of ${start}`}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} —
                {new Date(end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
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
            <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">
              Expand All
            </button>
            <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">
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
            const dayOrders = ordersByDate[date]
            const isExpanded = expandedDays.has(date)
            const dayTotal = dayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
            const colorClass = getDayColor(date)
            const today = isToday(date)

            return (
              <div key={date} className={`bg-white rounded-lg shadow-md overflow-hidden border ${today ? 'border-blue-400' : 'border-transparent'}`}>
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(date)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown className="h-5 w-5 text-gray-400" />
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
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-lg" style={{ color: '#006A4E' }}>
                      {formatCurrency(dayTotal)}
                    </span>
                  </div>
                </button>

                {/* Day Orders */}
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
                          <tr key={order.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm">{order.customer_business_name || '—'}</p>
                              <p className="text-xs text-gray-400">{order.customer_email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm space-y-0.5">
                                {order.order_items.slice(0, 2).map((item, idx) => (
                                  <p key={idx} className="text-gray-600 truncate max-w-48">
                                    <span className="font-semibold">{item.quantity}x</span> {item.product_name}
                                  </p>
                                ))}
                                {order.order_items.length > 2 && (
                                  <p className="text-xs text-gray-400">+{order.order_items.length - 2} more</p>
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
                              <div className="flex gap-1 justify-center">
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
                                  style={{ backgroundColor: '#CE1126' }}
                                >
                                  <FileDown className="h-3 w-3" />Inv
                                </a>
                                <a
                                  href={`/api/packing-slip/${order.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded text-white hover:opacity-90"
                                  style={{ backgroundColor: '#006A4E' }}
                                >
                                  <Package className="h-3 w-3" />Slip
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t">
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-gray-600 text-right">
                            Day Total
                          </td>
                          <td className="px-4 py-2 text-right font-bold" style={{ color: '#006A4E' }}>
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