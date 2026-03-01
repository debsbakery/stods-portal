'use client'

import { useState } from 'react'
import { Download, Loader2, Calendar } from 'lucide-react'

interface Props {
  availableDates: string[]
}

export default function BatchPackingSlipGenerator({ availableDates }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [customDate, setCustomDate] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)

  const activeDate = selectedDate || customDate

  const handleGenerate = async () => {
    if (!activeDate) {
      alert('Please select a date')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/batch-packing-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: activeDate }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate packing slips')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slips-${activeDate}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

    } catch (error) {
      console.error('Error:', error)
      alert('Failed to generate packing slips')
    } finally {
      setIsGenerating(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-xl font-semibold">Select Delivery Date</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Choose from existing dates
        </label>
        <select
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setCustomDate('') }}
          className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500"
        >
          <option value="">-- Select a date --</option>
          {availableDates.map((date) => (
            <option key={date} value={date}>
              {formatDate(date)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Or enter date manually
        </label>
        <input
          type="date"
          value={customDate}
          onChange={(e) => { setCustomDate(e.target.value); setSelectedDate('') }}
          className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500"
        />
      </div>

      {activeDate && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <span className="font-medium text-green-800">
            Selected: {formatDate(activeDate)}
          </span>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={!activeDate || isGenerating}
        className="w-full py-3 rounded-lg text-white font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: '#006A4E' }}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Generate Packing Slips
          </>
        )}
      </button>

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
              {formatDate(date)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}