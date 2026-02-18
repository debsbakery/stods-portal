'use client'

import { useState } from 'react'

export function ReminderControls() {
  const [loading, setLoading] = useState(false)
  
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <p className="text-sm text-yellow-800">
        📧 Payment reminder system coming soon
      </p>
      <p className="text-xs text-yellow-600 mt-1">
        Automatic email reminders for overdue invoices will be available after deployment
      </p>
    </div>
  )
}