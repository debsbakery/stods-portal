'use client'

import { useState } from 'react'
import { Loader2, PlayCircle, CheckCircle, Calendar } from 'lucide-react'

const ALL_DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

const DAY_LABELS: Record<string, string> = {
  sunday:    'Sun',
  monday:    'Mon',
  tuesday:   'Tue',
  wednesday: 'Wed',
  thursday:  'Thu',
  friday:    'Fri',
  saturday:  'Sat',
}

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

    const formatShort = (d: Date) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

    options.push({
      label: weekOffset === 1 ? 'Next Week' : weekOffset === 2 ? 'Week After Next' : '3 Weeks Out',
      offset: weekOffset,
      start: startStr,
      end: endStr,
      dateLabel: `${formatShort(weekStart)} — ${formatShort(weekEnd)}`,
    } as any)
  }

  return options
}

export default function StandingOrderActions() {
  const [generating,   setGenerating]   = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [skippedDays,  setSkippedDays]  = useState<string[]>([])
  const [result, setResult] = useState<{
    success: boolean
    message: string
    ordersCreated?: number
    orders?: any[]
  } | null>(null)

  const weekOptions = getWeekOptions()

  function toggleDay(day: string) {
    setSkippedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  async function handleGenerate() {
    const selected = weekOptions.find(w => w.offset === selectedWeek)
    if (!selected) return

    const skipMsg = skippedDays.length > 0
      ? `\n\nSkipping: ${skippedDays.map(d => DAY_LABELS[d]).join(', ')}`
      : ''

    if (!confirm(`Generate standing orders for:\n\n${selected.label}\n${selected.start} to ${selected.end}${skipMsg}\n\nAlready-existing orders will be skipped.`)) return

    setGenerating(true)
    setResult(null)

    try {
      const response = await fetch('/api/standing-orders/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ 
          week_offset: selectedWeek,
          skip_days: skippedDays,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success:       true,
          message:       data.message,
          ordersCreated: data.ordersCreated,
          orders:        data.orders,
        })
      } else {
        setResult({
          success: false,
          message: data.error || 'Generation failed',
        })
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message,
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* Week Selector */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          <Calendar className="h-4 w-4 inline mr-1" />
          Select Week
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {weekOptions.map(option => (
            <button
              key={option.offset}
              onClick={() => { setSelectedWeek(option.offset); setResult(null) }}
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

      {/* Day skip checkboxes */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          Skip days <span className="text-gray-400 font-normal">(tick to skip — e.g. public holidays)</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {ALL_DAYS.map(day => {
            const skipped = skippedDays.includes(day)
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  skipped
                    ? 'bg-red-100 border-red-300 text-red-700 line-through'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            )
          })}
        </div>
        {skippedDays.length > 0 && (
          <p className="text-xs text-red-600 mt-1.5 font-medium">
            ⚠️ {skippedDays.map(d => DAY_LABELS[d]).join(', ')} will be skipped
          </p>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {generating ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Generating orders...</>
        ) : (
          <><PlayCircle className="h-5 w-5" /> Generate Orders Now</>
        )}
      </button>

      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${
          result.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {result.success
            ? <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            : <Loader2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          }
          <div>
            <p className="font-semibold">{result.success ? 'Done' : 'Error'}</p>
            <p className="text-sm mt-0.5">{result.message}</p>
            {result.success && result.ordersCreated === 0 && (
              <p className="text-sm mt-1 text-green-700">
                All orders for this week already exist — no duplicates created.
              </p>
            )}
            {result.orders && result.orders.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {result.orders.map((o: any, idx: number) => (
                  <p key={idx} className="text-sm">
                    • {o.customer} — {o.deliveryDay} ({o.deliveryDate}) — ${o.total?.toFixed(2)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}