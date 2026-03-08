'use client'

import { useState } from 'react'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  FileText, Mail, Send, Users, DollarSign,
  Loader2, Calendar, ArrowLeft, BookOpen,
} from 'lucide-react'
import Link from 'next/link'

interface Customer {
  id: string
  business_name?: string
  contact_name?: string
  email?: string
  balance: number
  payment_terms?: string
  address?: string
}

interface Props {
  customers: Customer[]
  customersWithBalance: Customer[]
}

type Period = 'last_month' | 'this_month' | 'last_3' | 'custom'

interface SendResult {
  customer: string
  success: boolean
  error?: string
}

export default function StatementsView({ customers, customersWithBalance }: Props) {
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [period, setPeriod]                     = useState<Period>('last_month')
  const [customFrom, setCustomFrom]             = useState('')
  const [customTo, setCustomTo]                 = useState('')
  const [isSending, setIsSending]               = useState(false)
  const [isPrinting, setIsPrinting]             = useState(false)
  const [results, setResults]                   = useState<SendResult[]>([])
  const [showResults, setShowResults]           = useState(false)

  const getDateRange = (): { startDate: string; endDate: string } => {
    const now = new Date()
    switch (period) {
      case 'last_month': {
        const last = subMonths(now, 1)
        return {
          startDate: format(startOfMonth(last), 'yyyy-MM-dd'),
          endDate:   format(endOfMonth(last),   'yyyy-MM-dd'),
        }
      }
      case 'this_month':
        return {
          startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
          endDate:   format(now,               'yyyy-MM-dd'),
        }
      case 'last_3': {
        const three = subMonths(now, 3)
        return {
          startDate: format(startOfMonth(three), 'yyyy-MM-dd'),
          endDate:   format(now,                 'yyyy-MM-dd'),
        }
      }
      case 'custom':
        return { startDate: customFrom, endDate: customTo }
    }
  }

  const getTargetCustomers = () => {
    if (selectedCustomer === 'all')           return customersWithBalance
    if (selectedCustomer === 'all_customers') return customers.filter(c => c.email)
    return customers.filter(c => c.id === selectedCustomer)
  }

  const handlePrint = async (customerId: string, customerName: string) => {
    const { startDate, endDate } = getDateRange()
    const params = new URLSearchParams({ startDate, endDate })
    setIsPrinting(true)
    try {
      const res  = await fetch(`/api/statement/${customerId}?${params}`)
      if (!res.ok) throw new Error('Failed to generate PDF')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `statement-${customerName.replace(/\s+/g, '-')}-${endDate}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Failed to generate PDF: ' + err.message)
    } finally {
      setIsPrinting(false)
    }
  }

  const handleEmailSingle = async (customerId: string, customerName: string) => {
    const { startDate, endDate } = getDateRange()
    const params = new URLSearchParams({ startDate, endDate })
    if (!confirm('Send statement to ' + customerName + '?')) return
    setIsSending(true)
    try {
      const res  = await fetch(`/api/statement/${customerId}/email?${params}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      alert('Statement sent to ' + customerName)
    } catch (err: any) {
      alert('Failed: ' + err.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleSendAll = async () => {
    const targets = getTargetCustomers()
    if (targets.length === 0) {
      alert('No customers to send to')
      return
    }

    const { startDate, endDate } = getDateRange()
    const noEmail = targets.filter(c => !c.email)

    if (!confirm(
      'Send statements to ' + targets.length + ' customer(s)?\n' +
      'Period: ' + startDate + ' to ' + endDate +
      (noEmail.length > 0 ? '\n' + noEmail.length + ' skipped (no email)' : '')
    )) return

    setIsSending(true)
    setShowResults(false)

    try {
      const res  = await fetch('/api/statement/send-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          balanceOnly: selectedCustomer === 'all',
          customerIds: selectedCustomer !== 'all' && selectedCustomer !== 'all_customers'
            ? [selectedCustomer]
            : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setResults((json.errors ?? []).map((e: string) => {
        const [name, ...rest] = e.split(': ')
        return { customer: name, success: false, error: rest.join(': ') }
      }))
      setShowResults(true)
      alert('Done!\n\nSent: ' + json.sent + '\nFailed: ' + json.failed + '\nTotal: ' + json.total)
    } catch (err: any) {
      alert('Batch send failed: ' + err.message)
    } finally {
      setIsSending(false)
    }
  }

  const { startDate, endDate } = getDateRange()
  const targets   = getTargetCustomers()
  const totalOwed = customersWithBalance.reduce(
    (s, c) => s + Number(c.balance ?? 0), 0
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Back button */}
      <div className="mb-5">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm hover:opacity-80 w-fit"
          style={{ color: '#CE1126' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
      </div>

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Statements</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate and email account statements
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Customers</p>
            <p className="text-xl font-bold">{customers.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Users className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">With Balance</p>
            <p className="text-xl font-bold">{customersWithBalance.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <DollarSign className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Outstanding</p>
            <p className="text-xl font-bold text-red-600">${totalOwed.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border p-5 mb-6 space-y-5">

        {/* Period selector */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Statement Period
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'last_month', label: 'Last Month'        },
              { value: 'this_month', label: 'This Month (MTD)'  },
              { value: 'last_3',     label: 'Last 3 Months'     },
              { value: 'custom',     label: 'Custom Range'      },
            ] as { value: Period; label: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  period === opt.value
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex gap-3 mt-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Selected: {startDate} to {endDate}
          </p>
        </div>

        {/* Customer selector */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" /> Send To
          </p>
          <select
            value={selectedCustomer}
            onChange={e => setSelectedCustomer(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm"
          >
            <option value="all">
              All customers with balance ({customersWithBalance.length})
            </option>
            <option value="all_customers">
              All customers with email ({customers.filter(c => c.email).length})
            </option>
            <optgroup label="Individual Customer">
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.business_name || c.contact_name || c.email}
                  {Number(c.balance ?? 0) > 0
                    ? ' - $' + Number(c.balance).toFixed(2) + ' owing'
                    : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pt-2 border-t">
          <Button
            onClick={handleSendAll}
            disabled={isSending}
            className="bg-green-700 hover:bg-green-800 text-white gap-2"
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4" /> Email {targets.length} Statement{targets.length !== 1 ? 's' : ''}</>
            )}
          </Button>

          {selectedCustomer !== 'all' && selectedCustomer !== 'all_customers' && (
            <Button
              onClick={() => {
                const c = customers.find(x => x.id === selectedCustomer)
                handlePrint(selectedCustomer, c?.business_name || c?.contact_name || selectedCustomer)
              }}
              disabled={isPrinting}
              variant="outline"
              className="gap-2"
            >
              {isPrinting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><FileText className="h-4 w-4" /> Download PDF</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Failed results */}
      {showResults && results.filter(r => !r.success).length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-semibold text-red-800 mb-2">Failed sends:</p>
          <ul className="text-xs text-red-700 space-y-1">
            {results.filter(r => !r.success).map((r, i) => (
              <li key={i}>{r.customer}: {r.error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Customer table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Customers with Outstanding Balance</h2>
          <span className="text-sm text-gray-500">{customersWithBalance.length} customers</span>
        </div>

        {customersWithBalance.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="font-medium">All accounts are clear!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-right">Balance Owing</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customersWithBalance.map(customer => {
                const balance = Number(customer.balance ?? 0)
                const name    = customer.business_name || customer.contact_name || 'Unknown'
                return (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {customer.email ?? (
                        <span className="text-amber-500">No email</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      ${balance.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2 flex-wrap">

                        {/* Download PDF */}
                        <button
                          onClick={() => handlePrint(customer.id, name)}
                          disabled={isPrinting}
                          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <FileText className="h-3 w-3" /> PDF
                        </button>

                        {/* Email statement */}
                        {customer.email && (
                          <button
                            onClick={() => handleEmailSingle(customer.id, name)}
                            disabled={isSending}
                            className="text-green-700 hover:text-green-900 flex items-center gap-1 text-xs border border-green-600 rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
                          >
                            <Mail className="h-3 w-3" /> Email
                          </button>
                        )}

                        {/* View AR Ledger */}
                        <Link
                          href={`/admin/ar/${customer.id}`}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs border border-blue-400 rounded px-2 py-1 hover:bg-blue-50"
                        >
                          <BookOpen className="h-3 w-3" /> Ledger
                        </Link>

                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Monthly schedule notice */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-semibold mb-1">Automatic Monthly Schedule</p>
        <p>
          Statements auto-email on the <strong>1st of each month</strong> to all
          customers with balance greater than $0 at <strong>8:00 AM AEST</strong>.
        </p>
      </div>

    </div>
  )
}