'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mail, Loader2 } from 'lucide-react'

export default function BatchStatementSender() {
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleSendAll = async () => {
    const confirmed = confirm(
      'Send statements to all customers with outstanding balances?\n\nThis will email a statement to each customer with a balance > $0.'
    )

    if (!confirmed) return

    setIsSending(true)
    setResult(null)

    try {
      const response = await fetch('/api/statement/send-all', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send statements')
      }

      setResult(data)
      alert(
        `✅ Batch send complete!\n\n` +
        `Sent: ${data.sent}\n` +
        `Failed: ${data.failed}\n` +
        `Total: ${data.total}`
      )

    } catch (error: any) {
      console.error('Error sending batch statements:', error)
      alert(`❌ Failed to send statements: ${error.message}`)
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
            Send monthly statements to all customers with outstanding balances
          </p>
        </div>

        <Button
          onClick={handleSendAll}
          disabled={isSending}
          style={{ backgroundColor: '#006A4E', color: 'white' }}
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
              Send All Statements
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-800">
            ✅ Sent {result.sent} of {result.total} statements
            {result.failed > 0 && ` (${result.failed} failed)`}
          </p>
        </div>
      )}
    </div>
  )
}