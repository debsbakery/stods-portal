'use client'

import { useState } from 'react'
import { Loader2, PlayCircle, CheckCircle } from 'lucide-react'

export default function StandingOrderActions() {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    ordersCreated?: number
  } | null>(null)

  async function handleGenerate() {
    if (!confirm('Generate orders for all active standing orders this week?')) return

    setGenerating(true)
    setResult(null)

    // Use setTimeout to release UI thread before heavy fetch
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const response = await fetch('/api/standing-orders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: data.message,
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
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {generating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating orders...
          </>
        ) : (
          <>
            <PlayCircle className="h-5 w-5" />
            Generate Orders for This Week
          </>
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
            <p className="font-semibold">
              {result.success ? 'Done' : 'Error'}
            </p>
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