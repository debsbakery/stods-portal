'use client'

import { useState } from 'react'
import { ShoppingBag, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    business_name:  '',
    contact_name:   '',
    email:          '',
    phone:          '',
    address:        '',
    abn:            '',
    delivery_notes: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!form.business_name.trim()) throw new Error('Business name is required')
      if (!form.contact_name.trim())  throw new Error('Contact name is required')
      if (!form.email.trim())         throw new Error('Email is required')

      const res = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Registration failed')

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: '#006A4E' }} />
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#006A4E' }}>
            Application Received!
          </h1>
          <p className="text-gray-600 mb-2">
            Thank you, <strong>{form.business_name}</strong>.
          </p>
          <p className="text-gray-500 text-sm">
            We will review your application and be in touch at{' '}
            <strong>{form.email}</strong> within 1-2 business days.
          </p>
          <div className="mt-6 pt-6 border-t text-xs text-gray-400">
            <p>Deb&apos;s Bakery — Toowoomba QLD</p>
            <p>debs_bakery@outlook.com</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#006A4E' }}
            >
              <ShoppingBag className="h-7 w-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: '#006A4E' }}>
            Deb&apos;s Bakery
          </h1>
          <p className="text-gray-500 mt-1">Wholesale Account Application</p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Business Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="business_name"
              required
              value={form.business_name}
              onChange={handleChange}
              placeholder="e.g. Sunrise Cafe"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="contact_name"
              required
              value={form.contact_name}
              onChange={handleChange}
              placeholder="e.g. Jane Smith"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="jane@sunrise.com.au"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="(07) 1234 5678"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Address
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="123 Main St, Toowoomba QLD 4350"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ABN
            </label>
            <input
              type="text"
              name="abn"
              value={form.abn}
              onChange={handleChange}
              placeholder="12 345 678 901"
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Notes
            </label>
            <textarea
              name="delivery_notes"
              value={form.delivery_notes}
              onChange={handleChange}
              rows={3}
              placeholder="Any special delivery instructions..."
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#CE1126' }}
          >
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>

          <p className="text-xs text-gray-400 text-center pt-1">
            Already a customer?{' '}
            <a href="/portal" className="underline" style={{ color: '#006A4E' }}>
              Sign in to the portal
            </a>
          </p>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Questions? Call us on (07) 4632 9475
        </p>
      </div>
    </div>
  )
}