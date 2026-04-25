'use client'

import { useState } from 'react'
import CustomerLedgerClient from './customer-ledger-client'
import GstSummaryClient from './gst-summary-client'

interface Props {
  customerId:     string
  customer:       any
  entries:        any[]
  currentBalance: number
}

export default function TabView({ customerId, customer, entries, currentBalance }: Props) {
  const [tab, setTab] = useState<'ledger' | 'gst'>('ledger')

  const customerName = customer.business_name || customer.contact_name || 'Customer'

  return (
    <>
      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('ledger')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'ledger'
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
          }`}
        >
          📋 Transaction Ledger
        </button>
        <button
          onClick={() => setTab('gst')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'gst'
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
          }`}
        >
          🧾 GST Summary
        </button>
      </div>

      {tab === 'ledger' && (
        <CustomerLedgerClient
          customerId={customerId}
          customer={customer}
          entries={entries}
          currentBalance={currentBalance}
        />
      )}

      {tab === 'gst' && (
        <GstSummaryClient
          customerId={customerId}
          customerName={customerName}
        />
      )}
    </>
  )
}