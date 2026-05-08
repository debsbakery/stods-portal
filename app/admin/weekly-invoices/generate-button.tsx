// app/admin/weekly-invoices/generate-button.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

interface Customer {
  id:            string
  business_name: string
}

export default function GenerateWeeklyButton({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [open,       setOpen]       = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [weekStart,  setWeekStart]  = useState('')
  const [weekEnd,    setWeekEnd]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // Default to previous Sun–Sat when dialog opens
  function handleOpen() {
    const now     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
    const day     = now.getDay() // 0=Sun
    const thisSun = new Date(now)
    thisSun.setDate(now.getDate() - day)
    const prevSun = new Date(thisSun)
    prevSun.setDate(thisSun.getDate() - 7)
    const prevSat = new Date(prevSun)
    prevSat.setDate(prevSun.getDate() + 6)

    setWeekStart(prevSun.toISOString().split('T')[0])
    setWeekEnd(prevSat.toISOString().split('T')[0])
    setCustomerId(customers[0]?.id ?? '')
    setResult(null)
    setError(null)
    setOpen(true)
  }

  async function handleGenerate() {
    if (!customerId) { setError('Please select a customer'); return }
    if (!weekStart || !weekEnd) { setError('Please select a date range'); return }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res  = await fetch('/api/admin/weekly-invoices/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customer_id: customerId, week_start: weekStart, week_end: weekEnd }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Generation failed')
      } else if (!data.success) {
        setResult(`ℹ️ ${data.message}`)
      } else {
        setResult(`✅ ${data.message}`)
        router.refresh()
      }
    } catch (e: any) {
      setError(e.message ?? 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg
                   text-sm font-medium hover:bg-purple-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Generate Weekly Invoice
      </button>

      {/* ── Modal ── */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">📅 Generate Weekly Invoice</h2>
              <p className="text-sm text-gray-500 mt-1">
                Creates or updates a weekly invoice for the selected customer + week.
              </p>
            </div>

            <div className="p-6 space-y-4">

              {/* Customer selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer
                </label>
                {customers.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                    ⚠️ No customers have weekly billing enabled yet.
                    Go to <strong>Customers → Edit</strong> and set Invoice Frequency to Weekly.
                  </div>
                ) : (
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    className={inputClass}
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.business_name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Week range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Week Start (Sunday)
                  </label>
                  <input
                    type="date"
                    value={weekStart}
                    onChange={e => setWeekStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Week End (Saturday)
                  </label>
                  <input
                    type="date"
                    value={weekEnd}
                    onChange={e => setWeekEnd(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">
                📅 Defaults to the <strong>previous Sun–Sat</strong> week.
                Adjust dates to regenerate any past week. Running twice is safe — existing invoice will be updated.
              </div>

              {/* Result / error messages */}
              {result && (
                <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  {result}
                </div>
              )}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  ❌ {error}
                </div>
              )}

            </div>

            <div className="p-6 border-t flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || customers.length === 0}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-medium
                           hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                           transition-colors text-sm"
              >
                {loading ? 'Generating...' : '📅 Generate'}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm
                           hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}