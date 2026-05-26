'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  Trash2,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Copy,
  AlertTriangle,
  Download,
} from 'lucide-react'

interface QuoteItem {
  id: string
  product_id: string
  product_name?: string
  name?: string
  quantity: number
  unit_price: number
  total?: number
  line_total?: number
}

interface Quote {
  id: string
  quote_number: string
  customer_id: string
  customer_name?: string
  customer_business_name?: string
  customer_email: string
  customer_address: string
  customer_abn: string
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
  subtotal: number
  gst: number
  total: number
  notes: string | null
  terms: string | null
  valid_until: string | null
  token: string | null
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  created_at: string
  items: QuoteItem[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  draft:    { label: 'Draft',    color: 'text-gray-700',   bgColor: 'bg-gray-100',   icon: FileText },
  sent:     { label: 'Sent',     color: 'text-blue-700',   bgColor: 'bg-blue-100',   icon: Send },
  accepted: { label: 'Accepted', color: 'text-green-700',  bgColor: 'bg-green-100',  icon: CheckCircle },
  declined: { label: 'Declined', color: 'text-red-700',    bgColor: 'bg-red-100',    icon: XCircle },
  expired:  { label: 'Expired',  color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: Clock },
}

export default function QuoteDetailPage() {
  const router = useRouter()
  const params = useParams()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    fetchQuote()
  }, [quoteId])

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes/${quoteId}`)
      if (!res.ok) throw new Error('Quote not found')
      const data = await res.json()

      // API returns { quote, items } separately
      const q = data.quote || data
      const items = (data.items || q.items || []).map((item: any) => ({
        ...item,
        product_name: item.product_name || item.name || '(unnamed)',
        total: item.total ?? item.line_total ?? (item.quantity * item.unit_price),
      }))

      setQuote({ ...q, items })
    } catch (err) {
      console.error('Error fetching quote:', err)
    } finally {
      setLoading(false)
    }
  }

  async function sendQuote() {
    if (!confirm('Send this quote to the customer via email with PDF attached?')) return
    setSending(true)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send quote')
      alert(`Quote sent to ${data.sentTo}`)
      await fetchQuote()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }
  async function acceptQuote() {
    if (!confirm('Mark this quote as accepted? This will set contract prices for the customer.')) return
    setSending(true)
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to accept quote')
      alert('Quote accepted — contract prices have been set')
      await fetchQuote()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }
  async function deleteQuote() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete quote')
      router.push('/admin/quotes')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  function copyPublicLink() {
    if (!quote?.token) return alert('Quote has no public link yet — send the quote first')
    const url = `${window.location.origin}/quote/${quote.token}`
    navigator.clipboard.writeText(url)
    alert('Quote link copied to clipboard!')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading quote...</div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Quote not found</p>
          <button
            onClick={() => router.push('/admin/quotes')}
            className="text-blue-600 hover:underline"
          >
            Back to Quotes
          </button>
        </div>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft
  const StatusIcon = cfg.icon
  const isDraft = quote.status === 'draft'
  const isSent = quote.status === 'sent'
  const customerName = quote.customer_business_name || quote.customer_name || 'Unknown'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/quotes')}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Created {new Date(quote.created_at).toLocaleDateString('en-AU')}
                {quote.sent_at && ` · Sent ${new Date(quote.sent_at).toLocaleDateString('en-AU')}`}
                {quote.accepted_at && ` · Accepted ${new Date(quote.accepted_at).toLocaleDateString('en-AU')}`}
                {quote.declined_at && ` · Declined ${new Date(quote.declined_at).toLocaleDateString('en-AU')}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* PDF Download — always available */}
            <button
              onClick={() => window.open(`/api/quotes/${quoteId}/pdf`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>

            {/* Copy Link — only when token exists */}
            {quote.token && (
              <button
                onClick={copyPublicLink}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
            )}
            {/* Accept — for sent quotes */}
            {isSent && (
              <button
                onClick={acceptQuote}
                disabled={sending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Accept
              </button>
            )}
            {/* Send — draft or resend */}
            {(isDraft || isSent) && (
              <button
                onClick={sendQuote}
                disabled={sending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : isSent ? 'Resend' : 'Send Quote'}
              </button>
            )}

            {/* Delete — draft only */}
            {isDraft && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-700 font-medium">
                Are you sure you want to delete this quote?
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-white transition"
              >
                Cancel
              </button>
              <button
                onClick={deleteQuote}
                disabled={deleting}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Customer</h2>
              <p className="font-semibold text-gray-900 text-lg">{customerName}</p>
              {quote.customer_email && (
                <p className="text-sm text-gray-600 mt-1">{quote.customer_email}</p>
              )}
              {quote.customer_address && (
                <p className="text-sm text-gray-600 mt-1">{quote.customer_address}</p>
              )}
              {quote.customer_abn && (
                <p className="text-sm text-gray-500 mt-1">ABN: {quote.customer_abn}</p>
              )}
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-500 uppercase">
                  Items ({quote.items?.length || 0})
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Product</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.items || []).map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{item.product_name}</td>
                      <td className="px-3 py-3 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-3 text-right text-gray-600">${item.unit_price?.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">${item.total?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-end">
                  <div className="w-64 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium">${quote.subtotal?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST</span>
                      <span className="font-medium">${quote.gst?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t border-gray-300 pt-1.5">
                      <span>Total</span>
                      <span>${quote.total?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Terms */}
            {(quote.notes || quote.terms) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                {quote.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Notes</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
                  </div>
                )}
                {quote.terms && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Terms & Conditions</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.terms}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Details</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Quote #</span>
                  <span className="font-medium">{quote.quote_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
                {quote.valid_until && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Valid Until</span>
                    <span className="font-medium">
                      {new Date(quote.valid_until).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                )}
                {quote.sent_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sent</span>
                    <span className="font-medium">
                      {new Date(quote.sent_at).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                )}
                {quote.accepted_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Accepted</span>
                    <span className="font-medium text-green-600">
                      {new Date(quote.accepted_at).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                )}
                {quote.declined_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Declined</span>
                    <span className="font-medium text-red-600">
                      {new Date(quote.declined_at).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Actions</h2>
              <div className="space-y-2">
                <button
                  onClick={() => window.open(`/api/quotes/${quoteId}/pdf`, '_blank')}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition text-left"
                >
                  <Download className="w-4 h-4 text-gray-400" />
                  View / Print PDF
                </button>
                {quote.token && (
                  <button
                    onClick={copyPublicLink}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition text-left"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                    Copy Customer Link
                  </button>
                )}
                {quote.status === 'accepted' && (
                  <button
                    disabled
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-left opacity-50 cursor-not-allowed"
                  >
                    <FileText className="w-4 h-4 text-gray-400" />
                    Convert to Order (coming soon)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}