'use client'

import { useState } from 'react'

type Step = 'form' | 'success'

export default function RegisterForm() {
  const [step, setStep] = useState<Step>('form')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    business_name:  '',
    contact_name:   '',
    email:          '',
    phone:          '',
    address:        '',
    abn:            '',
    delivery_notes: '',
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      return
    }

    setStep('success')
  }

  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Application Received</h2>
        <p className="text-gray-500">
          Thank you! We have received your application for a trade account.
        </p>
        <p className="text-gray-500">
          We will review your details and contact you at <strong>{form.email}</strong> within 1 business day.
        </p>
        <p className="text-sm text-gray-400 pt-2">
          Questions? Call us on (07) 4632 9475
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-5"
    >
      {/* Business Name */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.business_name}
          onChange={(e) => update('business_name', e.target.value)}
          placeholder="e.g. Smith Cafe"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Contact Name */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Contact Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.contact_name}
          onChange={(e) => update('contact_name', e.target.value)}
          placeholder="e.g. Jane Smith"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="jane@smithcafe.com.au"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="(07) 4600 0000"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Delivery Address */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Delivery Address <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          placeholder="Street, Suburb QLD Postcode"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          required
        />
      </div>

      {/* ABN */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          ABN <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={form.abn}
          onChange={(e) => update('abn', e.target.value)}
          placeholder="00 000 000 000"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Delivery Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={form.delivery_notes}
          onChange={(e) => update('delivery_notes', e.target.value)}
          placeholder="e.g. Leave at back door, ring bell on arrival"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition"
      >
        {saving ? 'Submitting...' : 'Submit Application'}
      </button>

      <p className="text-xs text-center text-gray-400">
        By submitting you agree to be contacted by Deb's Bakery regarding your trade account application.
      </p>
    </form>
  )
}