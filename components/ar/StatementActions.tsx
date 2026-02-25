'use client'
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Mail, Calendar, Loader2 } from 'lucide-react'
import { addMonths, format } from 'date-fns'

interface StatementActionsProps {
  customer: {
    id: string
    business_name?: string
    contact_name?: string
    email?: string
    address?: string
    balance: number
    payment_terms?: string
  }
}

export default function StatementActions({ customer }: StatementActionsProps) {
 const [dateRange, setDateRange] = useState(() => ({
  from: addMonths(new Date(), -1),
  to: new Date(),
}))
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const presets = useMemo(() => [
  { label: 'Last Month',   from: addMonths(new Date(), -1), to: new Date() },
  { label: 'Last 3 Months',from: addMonths(new Date(), -3), to: new Date() },
  { label: 'YTD',          from: new Date(new Date().getFullYear(), 0, 1), to: new Date() },
  { label: 'All Time',     from: new Date(2020, 0, 1), to: new Date() },
], [])

  const handlePrintStatement = async () => {
    setIsGenerating(true)
    try {
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
      })

      const response = await fetch(`/api/statement/${customer.id}?${params}`)

      if (!response.ok) {
        throw new Error('Failed to generate statement')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const printWindow = window.open(url)
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      }

    } catch (error) {
      console.error('Error generating statement:', error)
      alert('Failed to generate statement. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEmailStatement = async () => {
    if (!customer.email) {
      alert('Customer has no email address on file')
      return
    }

    const confirmed = confirm(
      `Send statement to ${customer.email}?\n\nPeriod: ${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
    )

    if (!confirmed) return

    setIsSending(true)
    try {
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
      })

      const response = await fetch(
        `/api/statement/${customer.id}/email?${params}`,
        { method: 'POST' }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send statement')
      }

      alert(`✅ Statement sent successfully to ${customer.email}`)

    } catch (error: any) {
      console.error('Error sending statement:', error)
      alert(`❌ Failed to send statement: ${error.message}`)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border">
      <h3 className="text-lg font-semibold mb-4" style={{ color: '#006A4E' }}>
        📄 Statement Actions
      </h3>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Select Period:</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => setDateRange({ from: preset.from, to: preset.to })}
              className={
                format(dateRange.from, 'yyyy-MM-dd') === format(preset.from, 'yyyy-MM-dd') &&
                format(dateRange.to, 'yyyy-MM-dd') === format(preset.to, 'yyyy-MM-dd')
                  ? 'border-green-600 bg-green-50'
                  : ''
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded border">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="font-medium">Selected Period:</span>
          <span className="text-gray-700">
            {format(dateRange.from, 'dd/MM/yyyy')} - {format(dateRange.to, 'dd/MM/yyyy')}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handlePrintStatement}
          disabled={isGenerating}
          className="gap-2"
          style={{ backgroundColor: '#006A4E', color: 'white' }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Print Statement
            </>
          )}
        </Button>

        <Button
          onClick={handleEmailStatement}
          disabled={isSending || !customer.email}
          variant="outline"
          className="gap-2"
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Email Statement
            </>
          )}
        </Button>
      </div>

      {!customer.email && (
        <p className="text-sm text-amber-600 mt-3 flex items-center gap-1">
          <span>⚠️</span>
          No email on file - email button disabled
        </p>
      )}
    </div>
  )
}