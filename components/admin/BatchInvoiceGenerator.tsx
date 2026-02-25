'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Calendar } from 'lucide-react'
import { format } from 'date-fns'

interface BatchInvoiceGeneratorProps {
  availableDates: string[]
}

export default function BatchInvoiceGenerator({ availableDates }: BatchInvoiceGeneratorProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerateBatch = async () => {
    if (!selectedDate) {
      alert('Please select a date')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/batch-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate batch invoices')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      // Download ZIP file
      const a = document.createElement('a')
      a.href = url
      a.download = `invoices-${selectedDate}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      alert(`✅ Invoices generated successfully!`)

    } catch (error) {
      console.error('Error generating batch invoices:', error)
      alert('Failed to generate batch invoices. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const formatAusDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy')
    } catch {
      return dateStr
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Select Delivery Date</h2>

      {/* Date Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Delivery Date
        </label>
        <div className="flex gap-3 items-center">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">-- Select a date --</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {formatAusDate(date)}
              </option>
            ))}
          </select>

          <Button
            onClick={handleGenerateBatch}
            disabled={!selectedDate || isGenerating}
            style={{ backgroundColor: '#006A4E', color: 'white' }}
            className="gap-2 px-6"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generate Invoices
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Date Grid (Alternative View) */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Select Recent Dates</h3>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {availableDates.slice(0, 10).map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`p-3 text-sm rounded-lg border-2 transition-all ${
                selectedDate === date
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
    </div>
  )
}