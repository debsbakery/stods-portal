'use client'

import { useState } from 'react'
import { Loader2, PlayCircle, CheckCircle } from 'lucide-react'

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

export default function StandingOrderActions() {
  const [generating,   setGenerating]   = useState(false)
  const [skippedDays,  setSkippedDays]  = useState<string[]>([])
  const [result, setResult] = useState<{
    success: boolean
    message: string
    ordersCreated?: number
  } | null>(null)

  function toggleDay(day: string) {
    setSkippedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  async function handleGenerate() {
    const skipMsg = skippedDays.length > 0
      ? `\n\nSkipping: ${skippedDays.map(d => DAY_LABELS[d]).join(', ')}`
      : ''

    if (!confirm(`Generate orders for all active standing orders this week?${skipMsg}`)) return

    setGenerating(true)
    setResult(null)

    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const response = await fetch('/api/standing-orders/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ skip_days: skippedDays }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success:       true,
          message:       data.message,
          ordersCreated: data.ordersCreated,
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
          <><PlayCircle className="h-5 w-5" /> Generate Orders for This Week</>
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
          </div>
        </div>
      )}
    </div>
  )
}