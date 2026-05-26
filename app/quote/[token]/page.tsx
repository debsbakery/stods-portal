'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react'

interface QuoteItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  total: number
}

interface PublicQuote {
  id: string
  quote_number: string
  customer_business_name: string
  status: string
  subtotal: number
  gst: number
  total: number
  notes: string | null
  terms: string | null
  valid_until: string | null
  created_at: string
  items: QuoteItem[]
  company_name?: string
  company_address?: string
  company_phone?: string
  company_email?: string
  company_logo_url?: string | null
}

export default function CustomerQuotePage() {
  const params = useParams()
  const token = params.token as string

  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [responding, setResponding] = useState(false)
  const [responded, setResponded] = useState<'accepted' | 'declined' | null>(null)

  useEffect(() => {
    fetchQuote()
  }, [token])

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes/public/${token}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Quote not found or link is invalid.')
        } else {
          setError('Something went wrong loading this quote.')
        }
        return
      }
      const data = await res.json()
      const q = data.quote || data
      setQuote(q)
      if (q.status === 'accepted') setResponded('accepted')
      if (q.status === 'declined') setResponded('declined')
    } catch {
      setError('Unable to load quote. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function respondToQuote(action: 'accept' | 'decline') {
    const msg = action === 'accept'
      ? 'Accept this quote? This will confirm the pricing.'
      : 'Decline this quote?'
    if (!confirm(msg)) return

    setResponding(true)
    try {
      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to respond')
      }
      setResponded(action === 'accept' ? 'accepted' : 'declined')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setResponding(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading quote...</div>
      </div>
    )
  }

  // ── Error / Not Found ────────────────────────────────────────────────
  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-md">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Quote Not Found</h1>
          <p className="text-sm text-gray-500">{error || 'This quote link is invalid or has expired.'}</p>
        </div>
      </div>
    )
  }

  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date()
  const canRespond = quote.status === 'sent' && !isExpired && !responded

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Company Header */}
        <div className="text-center mb-8">
          {quote.company_logo_url && (
            <img
              src={quote.company_logo_url}
              alt={quote.company_name || 'Logo'}
              className="h-16 mx-auto mb-3"
            />
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {quote.company_name || 'Quote'}
          </h1>
          {quote.company_address && (
            <p className="text-sm text-gray-500 mt-1">{quote.company_address}</p>
          )}
          {quote.company_phone && (
            <p className="text-sm text-gray-500">{quote.company_phone}</p>
          )}
        </div>

        {/* ── Response Banners ─────────────────────────────────────────── */}
        {responded === 'accepted' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-green-800">Quote Accepted</h2>
            <p className="text-sm text-green-600 mt-1">
              Thank you! The quoted prices have been confirmed.
            </p>
          </div>
        )}

        {responded === 'declined' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-red-800">Quote Declined</h2>
            <p className="text-sm text-red-600 mt-1">
              This quote has been declined. Please contact us to discuss further.
            </p>
          </div>
        )}

        {isExpired && !responded && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6 text-center">
            <Clock className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-yellow-800">Quote Expired</h2>
            <p className="text-sm text-yellow-600 mt-1">
              This quote has expired. Please contact us for updated pricing.
            </p>
          </div>
        )}

        {/* ── Quote Card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Quote Header */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Date: {new Date(quote.created_at).toLocaleDateString('en-AU')}
                </p>
                {quote.valid_until && (
                  <p className="text-sm text-gray-500">
                    Valid until: {new Date(quote.valid_until).toLocaleDateString('en-AU')}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Prepared for</p>
                <p className="font-semibold text-gray-900">{quote.customer_business_name}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="px-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="text-center py-3 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase">Price</th>
                  <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {(quote.items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                    <td className="py-3 text-sm text-center text-gray-600">{item.quantity}</td>
                    <td className="py-3 text-sm text-right text-gray-600">${item.unit_price?.toFixed(2)}</td>
                    <td className="py-3 text-sm text-right font-medium text-gray-900">${item.total?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-end">
              <div className="w-56 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">${quote.subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">GST</span>
                  <span className="font-medium">${quote.gst?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-gray-300 pt-2">
                  <span>Total (inc GST)</span>
                  <span>${quote.total?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          {quote.terms && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Terms & Conditions</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.terms}</p>
            </div>
          )}

          {/* Notes */}
          {quote.notes && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* ── Accept / Decline Buttons ──────────────────────────────── */}
          {canRespond && (
            <div className="px-6 py-6 border-t border-gray-200 bg-white">
              <p className="text-sm text-gray-500 text-center mb-4">
                Please review the items and pricing above, then accept or decline this quote.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => respondToQuote('decline')}
                  disabled={responding}
                  className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  Decline
                </button>
                <button
                  onClick={() => respondToQuote('accept')}
                  disabled={responding}
                  className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
                >
                  <CheckCircle className="w-5 h-5" />
                  {responding ? 'Processing...' : 'Accept Quote'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-400">
            {quote.company_name && `© ${new Date().getFullYear()} ${quote.company_name}`}
          </p>
        </div>
      </div>
    </div>
  )
}