// components/admin/BatchInvoiceGenerator.tsx
'use client'

import { useState } from 'react'
import { Download, Loader2, Calendar, Mail, MailX } from 'lucide-react'

interface BatchInvoiceGeneratorProps {
  availableDates: string[]
}

function getBrisbaneToday(): string {
  const brisbane = new Date(Date.now() + 10 * 60 * 60 * 1000)
  return brisbane.toISOString().split('T')[0]
}

export default function BatchInvoiceGenerator({ availableDates }: BatchInvoiceGeneratorProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [customDate,   setCustomDate]   = useState<string>(getBrisbaneToday())
  const [sendEmails,   setSendEmails]   = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result,       setResult]       = useState<any>(null)

  const activeDate = selectedDate || customDate

  const handleGenerateBatch = async () => {
    if (!activeDate) {
      alert('Please select a date')
      return
    }

    if (sendEmails && !confirm('This will send invoice emails to all customers. Continue?')) {
      return
    }

    setIsGenerating(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/batch-invoice', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_date: activeDate,
          sendEmails,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate batch invoices')
      }

      setResult(data)

    } catch (error: any) {
      console.error('Batch invoice error:', error)
      setResult({ success: false, error: error.message })
    } finally {
      setIsGenerating(false)
    }
  }

  const formatAusDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">

      <h2 className="text-xl font-semibold">Select Delivery Date</h2>

      {/* Dropdown — existing order dates */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Choose from existing order dates
        </label>
        <select
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setCustomDate('') }}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-sm"
        >
          <option value="">-- Select a date --</option>
          {availableDates.map((date) => (
            <option key={date} value={date}>
              {formatAusDate(date)}
            </option>
          ))}
        </select>
      </div>

      {/* Manual date entry — defaults to Brisbane today */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Or enter any date manually
        </label>
        <input
          type="date"
          value={customDate}
          onChange={(e) => { setCustomDate(e.target.value); setSelectedDate('') }}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-sm"
        />
      </div>

      {/* Email toggle */}
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
        <button
          type="button"
          onClick={() => setSendEmails(!sendEmails)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            sendEmails ? 'bg-green-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              sendEmails ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <div className="flex items-center gap-2">
          {sendEmails
            ? <Mail  className="h-4 w-4 text-green-600" />
            : <MailX className="h-4 w-4 text-gray-400" />
          }
          <span className="text-sm font-medium">
            {sendEmails
              ? 'Will send invoice emails to customers'
              : 'Invoice only — no emails'
            }
          </span>
        </div>
      </div>

      {/* Active date display */}
      {activeDate && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <span className="font-medium text-green-800">
            Selected: {formatAusDate(activeDate)}
          </span>
          {sendEmails && (
            <span className="ml-2 text-green-600">+ sending emails</span>
          )}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerateBatch}
        disabled={!activeDate || isGenerating}
        className="w-full py-3 rounded-lg text-white font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: '#006A4E' }}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Generate Invoices for {activeDate ? formatAusDate(activeDate) : '...'}
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-lg border text-sm ${
          result.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {result.success ? (
            <div className="space-y-1">
              <p className="font-semibold">Batch invoicing complete</p>
              <p>Orders invoiced: {result.invoiced}</p>
              <p>Total amount: ${Number(result.total_amount ?? 0).toFixed(2)}</p>
              {result.emails_sent !== undefined && (
                <p>Emails sent: {result.emails_sent}</p>
              )}
              {result.email_errors && result.email_errors.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                  <p className="font-medium">Email errors:</p>
                  {result.email_errors.map((err: string, i: number) => (
                    <p key={i} className="text-xs">{err}</p>
                  ))}
                </div>
              )}
              {result.invoiced === 0 && (
                <p className="text-gray-600">No pending orders found for this date.</p>
              )}
            </div>
          ) : (
            <p>Error: {result.error}</p>
          )}
        </div>
      )}

      {/* Quick select grid */}
      {availableDates.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Select</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {availableDates.slice(0, 10).map((date) => (
              <button
                key={date}
                onClick={() => { setSelectedDate(date); setCustomDate('') }}
                className={`p-3 text-sm rounded-lg border-2 transition-all ${
                  activeDate === date
                    ? 'border-green-600 bg-green-50 text-green-800 font-semibold'
                    : 'border-gray-200 hover:border-green-400 hover:bg-gray-50'
                }`}
              >
                <Calendar className="h-4 w-4 mx-auto mb-1" />
                {formatAusDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}