'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Mail, Calendar, Loader2, FileText } from 'lucide-react'
import { addMonths, format, startOfDay } from 'date-fns'

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

type Preset = {
  label: string
  from: Date
  to: Date
}

function getPresets(): Preset[] {
  const today = startOfDay(new Date())
  return [
    { label: 'Last Month',    from: addMonths(today, -1), to: today },
    { label: 'Last 3 Months', from: addMonths(today, -3), to: today },
    { label: 'YTD',           from: new Date(today.getFullYear(), 0, 1), to: today },
    { label: 'All Time',      from: new Date(2020, 0, 1), to: today },
  ]
}

export default function StatementActions({ customer }: StatementActionsProps) {
  // Use null initial state to avoid hydration mismatch
  // Dates are only set after component mounts on client
  const [mounted, setMounted]         = useState(false)
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [activePreset, setActivePreset] = useState('Last Month')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending]       = useState(false)

  // Set dates only on client after mount — prevents hydration mismatch
  useEffect(() => {
    const today = startOfDay(new Date())
    setDateFrom(format(addMonths(today, -1), 'yyyy-MM-dd'))
    setDateTo(format(today, 'yyyy-MM-dd'))
    setMounted(true)
  }, [])

  function applyPreset(preset: Preset) {
    setDateFrom(format(preset.from, 'yyyy-MM-dd'))
    setDateTo(format(preset.to,   'yyyy-MM-dd'))
    setActivePreset(preset.label)
  }

  const handleOpenInvoices = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/statement/' + customer.id + '/open-invoices')
      if (!res.ok) throw new Error('Failed to generate open invoices PDF')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'open-invoices-' + (customer.business_name || customer.id).replace(/\s+/g, '-') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Failed: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrintStatement = async () => {
    setIsGenerating(true)
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo })
      const res    = await fetch('/api/statement/' + customer.id + '?' + params)
      if (!res.ok) throw new Error('Failed to generate statement')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'statement-' + (customer.business_name || customer.id).replace(/\s+/g, '-') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Failed to generate statement: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEmailStatement = async () => {
    if (!customer.email) {
      alert('Customer has no email address on file')
      return
    }
    if (!confirm('Send statement to ' + customer.email + '?\n\nPeriod: ' + dateFrom + ' to ' + dateTo)) {
      return
    }
    setIsSending(true)
    try {
      const params   = new URLSearchParams({ startDate: dateFrom, endDate: dateTo })
      const response = await fetch(
        '/api/statement/' + customer.id + '/email?' + params,
        { method: 'POST' }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send statement')
      }
      alert('Statement sent successfully to ' + customer.email)
    } catch (err: any) {
      alert('Failed to send statement: ' + err.message)
    } finally {
      setIsSending(false)
    }
  }

  // Render nothing date-related until mounted — avoids hydration mismatch
  if (!mounted) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border">
        <h3 className="text-lg font-semibold mb-4" style={{ color: '#006A4E' }}>
          Statement Actions
        </h3>
        <div className="h-24 animate-pulse bg-gray-100 rounded" />
      </div>
    )
  }

  const presets = getPresets()

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border">
      <h3 className="text-lg font-semibold mb-4" style={{ color: '#006A4E' }}>
        Statement Actions
      </h3>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Select Period:</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(preset => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset)}
              className={activePreset === preset.label ? 'border-green-600 bg-green-50' : ''}
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
          <span className="text-gray-700">{dateFrom} to {dateTo}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handlePrintStatement}
          disabled={isGenerating}
          className="gap-2"
          style={{ backgroundColor: '#006A4E', color: 'white' }}
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
          ) : (
            <><Download className="h-4 w-4" /> Print Statement</>
          )}
        </Button>

        <Button
          onClick={handleOpenInvoices}
          disabled={isGenerating}
          variant="outline"
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Open Invoices PDF
        </Button>

        <Button
          onClick={handleEmailStatement}
          disabled={isSending || !customer.email}
          variant="outline"
          className="gap-2"
        >
          {isSending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
          ) : (
            <><Mail className="h-4 w-4" /> Email Statement</>
          )}
        </Button>
      </div>

      {!customer.email && (
        <p className="text-sm text-amber-600 mt-3">
          No email on file - email button disabled
        </p>
      )}
    </div>
  )
}