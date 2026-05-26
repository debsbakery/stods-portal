'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Search,
} from 'lucide-react'

interface Quote {
  id: string
  quote_number: string
  customer_id: string
  customer_business_name: string
  customer_email: string
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
  subtotal: number
  gst: number
  total: number
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: XCircle },
  expired: { label: 'Expired', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
}

export default function QuotesPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchQuotes()
  }, [])

  async function fetchQuotes() {
    try {
      const res = await fetch('/api/quotes')
      if (!res.ok) throw new Error('Failed to fetch quotes')
      const data = await res.json()
      setQuotes(data.quotes || data || [])
    } catch (err) {
      console.error('Error fetching quotes:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter
      const matchesSearch =
        search === '' ||
        q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
        q.customer_business_name?.toLowerCase().includes(search.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [quotes, statusFilter, search])

  const counts = useMemo(() => ({
    all: quotes.length,
    draft: quotes.filter((q) => q.status === 'draft').length,
    sent: quotes.filter((q) => q.status === 'sent').length,
    accepted: quotes.filter((q) => q.status === 'accepted').length,
    declined: quotes.filter((q) => q.status === 'declined').length,
  }), [quotes])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading quotes...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
              <p className="text-sm text-gray-500">{quotes.length} total quotes</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin/quotes/new')}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            <Plus className="w-4 h-4" />
            New Quote
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {Object.entries(counts).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status} ({count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by quote number or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No quotes found</p>
              <p className="text-sm mt-1">
                {statusFilter !== 'all'
                  ? 'Try changing the filter'
                  : 'Create your first quote to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Quote #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total (inc GST)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valid Until</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((q) => {
                    const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft
                    const StatusIcon = cfg.icon
                    return (
                      <tr
                        key={q.id}
                        onClick={() => router.push(`/admin/quotes/${q.id}`)}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition"
                      >
                        <td className="px-4 py-3 font-medium text-blue-600">{q.quote_number}</td>
                        <td className="px-4 py-3 text-gray-900">{q.customer_business_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          ${q.total?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(q.created_at).toLocaleDateString('en-AU')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {q.valid_until
                            ? new Date(q.valid_until).toLocaleDateString('en-AU')
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}