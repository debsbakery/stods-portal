// components/ar/BatchStatementSender.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mail, Loader2, FileText } from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export default function BatchStatementSender() {
  const [isSending, setIsSending] = useState(false)
  const [result, setResult]       = useState<any>(null)

  const handleSendAll = async () => {
    // Default to last complete month
    const lastMonth = subMonths(new Date(), 1)
    const startDate = format(startOfMonth(lastMonth), 'yyyy-MM-dd')
    const endDate   = format(endOfMonth(lastMonth),   'yyyy-MM-dd')
    const label     = format(lastMonth, 'MMMM yyyy')

    const confirmed = confirm(
      `Send statements to all customers with outstanding balances?\n\n` +
      `Period: ${label}\n\n` +
      `This will email a PDF statement to each customer with balance > $0.`
    )
    if (!confirmed) return

    setIsSending(true)
    setResult(null)

    try {
      const response = await fetch('/api/statement/send-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          startDate,
          endDate,
          balanceOnly: true,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send statements')

      setResult(data)
      alert(
        `Batch send complete!\n\n` +
        `Sent: ${data.sent}\n` +
        `Failed: ${data.failed}\n` +
        `Total: ${data.total}`
      )

    } catch (error: any) {
      console.error('Error sending batch statements:', error)
      alert(`Failed to send statements: ${error.message}`)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Batch Statement Sender</h3>
          <p className="text-sm text-gray-600">
            Email last month statements to all customers with outstanding balances
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSendAll}
            disabled={isSending}
            style={{ backgroundColor: '#006A4E', color: 'white' }}
            className="gap-2"
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Mail className="h-4 w-4" /> Send All Statements</>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => window.location.href = '/admin/statements'}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Statement Manager
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-800">
            Sent {result.sent} of {result.total} statements
            {result.failed > 0 && ` (${result.failed} failed)`}
          </p>
          {result.errors && result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 list-disc list-inside">
              {result.errors.map((e: string, i: number) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}