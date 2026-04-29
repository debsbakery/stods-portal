'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, Calendar as CalendarIcon, Loader2, Sparkles, Edit3 } from 'lucide-react'
import { addDays, format } from 'date-fns'

interface OrderItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
}

interface LastOrder {
  id: string
  delivery_date: string
  total_amount: number
  status: string
  created_at: string
  order_items: OrderItem[]
}

interface Props {
  lastOrder: LastOrder | null
  cutoffTime?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

function getAvailableDates(cutoffTime?: string): Date[] {
  const dates: Date[] = []
  const nowUtc = new Date()
  const nowBrisbane = new Date(nowUtc.getTime() + 10 * 60 * 60 * 1000)
  const cutoffHour = cutoffTime ? parseInt(cutoffTime.split(':')[0], 10) : 14
  const todayHour = nowBrisbane.getUTCHours()
  const daysToAdd = todayHour < cutoffHour ? 1 : 2

  let currentDate = addDays(nowBrisbane, daysToAdd)
  for (let i = 0; i < 14; i++) {
    if (currentDate.getUTCDay() !== 0) {  // skip Sundays
      dates.push(new Date(currentDate))
    }
    currentDate = addDays(currentDate, 1)
  }
  return dates
}

export default function RepeatOrderCard({ lastOrder, cutoffTime }: Props) {
  const router = useRouter()
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [reordering, setReordering] = useState(false)

  // Don't show the card if no last order
  if (!lastOrder || !lastOrder.order_items || lastOrder.order_items.length === 0) {
    return null
  }

  const availableDates = getAvailableDates(cutoffTime)
  const items = lastOrder.order_items
  const itemCount = items.length
  const previewItems = items.slice(0, 3)
  const remainingCount = itemCount - 3

  // Days since last order
  const lastOrderDate = new Date(lastOrder.created_at)
  const daysSince = Math.floor(
    (Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysSinceLabel =
    daysSince === 0 ? 'today' :
    daysSince === 1 ? 'yesterday' :
    `${daysSince} days ago`

  // ── Reorder Now ─────────────────────────────────────────────────────────────
  async function handleReorderNow() {
    if (!deliveryDate) {
      alert('Please select a delivery date first')
      return
    }

    if (!confirm(
      `Place this exact order again for ${format(deliveryDate, 'EEEE, d MMMM')}?\n\n${itemCount} items, total ~${fmt(lastOrder!.total_amount)}\n\n(Final total may differ if prices have changed)`
    )) return

    setReordering(true)

    try {
      const res = await fetch('/api/portal/repeat-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_order_id: lastOrder!.id,
          delivery_date: format(deliveryDate, 'yyyy-MM-dd'),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order')
      }

      const skippedMsg = data.skipped_items?.length > 0
        ? `\n\n⚠️ ${data.skipped_items.length} item(s) skipped (no longer available):\n${data.skipped_items.join(', ')}`
        : ''

      alert(`Order placed!\n\n${data.item_count} items\nTotal: ${fmt(data.total_amount)}${skippedMsg}`)
      router.push(`/order/success?id=${data.order_id}`)

    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setReordering(false)
    }
  }

  // ── Customise First — load items into cart and go to /order ────────────────
  function handleCustomiseFirst() {
    const cartItems = items.map(item => ({
      product: {
        id:             item.product_id,
        name:           item.product_name,
        price:          item.unit_price,
        unit_price:     item.unit_price,
        unit:           'each',
        min_quantity:   1,
        max_quantity:   999,
        gst_applicable: false,  // will be re-evaluated on checkout
      },
      quantity: item.quantity,
    }))

    localStorage.setItem('cart', JSON.stringify(cartItems))
    router.push('/order')
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300 rounded-xl shadow-lg overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-white border-b border-green-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-green-100 p-2.5 rounded-lg">
              <Repeat className="h-6 w-6 text-green-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Order Again
                <Sparkles className="h-4 w-4 text-yellow-500" />
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Your last order placed {daysSinceLabel}
              </p>
            </div>
          </div>
          <span className="text-sm font-semibold text-gray-700 bg-white px-3 py-1 rounded-full border border-green-200">
            {fmt(lastOrder.total_amount)}
          </span>
        </div>
      </div>

      {/* Items preview */}
      <div className="p-5">
        <p className="text-sm font-medium text-gray-700 mb-2">
          {itemCount} item{itemCount !== 1 ? 's' : ''} including:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 mb-4">
          {previewItems.map((item, idx) => (
            <li key={idx} className="flex justify-between">
              <span>• {item.product_name}</span>
              <span className="font-medium text-gray-700">×{item.quantity}</span>
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="text-gray-400 italic">
              + {remainingCount} more item{remainingCount !== 1 ? 's' : ''}
            </li>
          )}
        </ul>

        {/* Date picker */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Delivery date
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCalendar(!showCalendar)}
              className="w-full px-3 py-2.5 border-2 border-green-300 rounded-md text-left flex items-center justify-between bg-white hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <span className={deliveryDate ? "text-gray-900 font-medium" : "text-gray-400"}>
                {deliveryDate ? format(deliveryDate, 'EEEE, d MMMM yyyy') : 'Select delivery date'}
              </span>
              <CalendarIcon className="h-5 w-5 text-green-600" />
            </button>

            {showCalendar && (
              <div className="absolute z-20 mt-2 bg-white border-2 border-green-300 rounded-lg shadow-xl p-2 max-h-64 overflow-y-auto w-full">
                <div className="grid gap-1">
                  {availableDates.map((date) => (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => {
                        setDeliveryDate(date)
                        setShowCalendar(false)
                      }}
                      className={`px-4 py-2 text-left rounded transition-colors text-sm ${
                        deliveryDate && date.toDateString() === deliveryDate.toDateString()
                          ? "bg-green-600 text-white font-semibold"
                          : "hover:bg-green-50"
                      }`}
                    >
                      {format(date, 'EEEE, d MMMM')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            No Sunday deliveries · Cutoff: {cutoffTime || '14:00'} day before
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleReorderNow}
            disabled={!deliveryDate || reordering}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold shadow hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {reordering ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Placing Order...
              </>
            ) : (
              <>
                <Repeat className="h-5 w-5" />
                Reorder Now
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCustomiseFirst}
            disabled={reordering}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-green-600 text-green-700 rounded-lg font-semibold hover:bg-green-50 disabled:opacity-50 transition"
          >
            <Edit3 className="h-5 w-5" />
            Customise First
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-3">
          Prices will be updated to current rates
        </p>
      </div>
    </div>
  )
}