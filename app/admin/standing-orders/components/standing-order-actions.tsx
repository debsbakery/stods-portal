'use client'

import { useState } from 'react'
import { Loader2, PlayCircle, Calendar } from 'lucide-react'

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function getWeekOptions() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
  const currentDay = now.getDay()

  const options: Array<{ label: string; offset: number; start: string; end: string }> = []

  for (let weekOffset = 1; weekOffset <= 3; weekOffset++) {
    const daysUntilNextSunday = currentDay === 0 ? 7 : 7 - currentDay
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + daysUntilNextSunday + (weekOffset - 1) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    const startStr = weekStart.toISOString().split('T')[0]
    const endStr = weekEnd.toISOString().split('T')[0]

    options.push({ 
      label: weekOffset === 1 ? 'Next Week' : weekOffset === 2 ? 'Week After Next' : '3 Weeks Out',
      offset: weekOffset, 
      start: startStr, 
      end: endStr 
    })
  }

  return options
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function StandingOrderActions() {
  const [generating, setGenerating] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [skipDays, setSkipDays] = useState<string[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [orderDetails, setOrderDetails] = useState<any[]>([])

  const weekOptions = getWeekOptions()

  function toggleSkipDay(day: string) {
    setSkipDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  async function handleManualGeneration() {
    const selected = weekOptions.find(w => w.offset === selectedWeek)
    if (!selected) return

    const skipMsg = skipDays.length > 0 
      ? `\nSkipping: ${skipDays.map(capitalize).join(', ')}` 
      : ''

    if (!confirm(
      `Generate standing orders for:\n\n${selected.label}\n${selected.start} to ${selected.end}${skipMsg}\n\nAlready-existing orders will be skipped.`
    )) return

    setGenerating(true)
    setMessage(null)
    setOrderDetails([])

    try {
      const response = await fetch('/api/standing-orders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          week_offset: selectedWeek,
          skip_days: skipDays,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `✅ Generated ${data.ordersCreated || 0} orders for ${selected.start} to ${selected.end}`,
        })
        if (data.orders?.length > 0) {
          setOrderDetails(data.orders)
        }
        if (data.errors?.length > 0) {
          setOrderDetails(prev => [...prev, ...data.errors.map((e: any) => ({
            customer: e.customer,
            deliveryDay: '❌ ERROR',
            deliveryDate: e.error,
            total: 0,
          }))])
        }
      } else {
        setMessage({
          type: 'error',
          text: `❌ Failed: ${data.error || 'Unknown error'}`,
        })
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Error: ${error.message}`,
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      {/* Week Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Calendar className="h-4 w-4 inline mr-1" />
          Select Week
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          {weekOptions.map(option => (
            <button
              key={option.offset}
              onClick={() => { setSelectedWeek(option.offset); setMessage(null); setOrderDetails([]) }}
              className={`px-4 py-3 rounded-lg border-2 text-left text-sm transition-all ${
                selectedWeek === option.offset
                  ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">📅 {option.label}</div>
              <div className="text-xs mt-0.5 opacity-75">
                {new Date(option.start + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                {' — '}
                {new Date(option.end + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Skip Days */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Skip Days (public holidays, closures etc.)
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleSkipDay(day)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                skipDays.includes(day)
                  ? 'bg-red-100 border-red-300 text-red-700 line-through'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {capitalize(day).slice(0, 3)}
            </button>
          ))}
        </div>
        {skipDays.length > 0 && (
          <p className="text-xs text-red-600 mt-1">
            ⚠️ Orders for {skipDays.map(capitalize).join(', ')} will be skipped
          </p>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleManualGeneration}
        disabled={generating}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {generating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <PlayCircle className="h-5 w-5" />
            Generate Orders Now
          </>
        )}
      </button>

      {/* Results */}
      {message && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <p className="font-semibold">{message.text}</p>
          {orderDetails.length > 0 && (
            <div className="mt-3 space-y-1">
              {orderDetails.map((o: any, idx: number) => (
                <p key={idx} className="text-sm">
                  • {o.customer} — {o.deliveryDay} ({o.deliveryDate}) {o.total > 0 ? `— $${o.total.toFixed(2)}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}