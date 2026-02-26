'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Customer {
  id: string
  business_name: string
  contact_name: string
  email: string
  phone?: string
  address?: string
  abn?: string
  delivery_notes?: string
  status: string
  payment_terms: number
  balance?: number
}

interface Props {
  customer?: Customer
  isEditing?: boolean
}

export default function CustomerForm({ customer, isEditing = false }: Props) {
  const router = useRouter()
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [success,          setSuccess]          = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [allowDuplicate,   setAllowDuplicate]   = useState(false)

  const [form, setForm] = useState({
    business_name:  customer?.business_name  ?? '',
    contact_name:   customer?.contact_name   ?? '',
    email:          customer?.email          ?? '',
    phone:          customer?.phone          ?? '',
    address:        customer?.address        ?? '',
    abn:            customer?.abn            ?? '',
    delivery_notes: customer?.delivery_notes ?? '',
    status:         customer?.status         ?? 'active',
    payment_terms:  customer?.payment_terms  ?? 30,
  })

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  // ✅ Auto-resubmit when duplicate is confirmed
  useEffect(() => {
    if (allowDuplicate) {
      submitForm()
    }
  }, [allowDuplicate])

  async function submitForm() {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const url    = isEditing ? `/api/admin/customers/${customer?.id}` : '/api/customers'
      const method = isEditing ? 'PUT' : 'POST'

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          allow_duplicate_email: allowDuplicate,
        }),
      })
      const data = await res.json()

      if (data.duplicate_email) {
        setDuplicateWarning(data.existing_business)
        setLoading(false)
        return
      }

      if (data.error) throw new Error(data.error)

      setSuccess(isEditing ? '✅ Customer updated!' : '✅ Customer created!')
      setTimeout(() => router.push('/admin/customers'), 1200)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAllowDuplicate(false)  // reset on fresh submit
    await submitForm()
  }

  const inputClass = "w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-5">

      {error   && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-green-700 text-sm">
          {success}
        </div>
      )}

 {duplicateWarning && (
  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
    <p className="text-amber-800 font-semibold text-sm">
      ⚠️ Email already used by &ldquo;{duplicateWarning}&rdquo;
    </p>
    <p className="text-amber-700 text-xs mt-1">
      Fine for invoicing — both customers will receive emails at this address.
    </p>
    <p className="text-amber-700 text-xs mt-1 font-semibold">
      ⚠️ Note: Shared email customers cannot use the online portal separately.
    </p>
    <div className="flex gap-2 mt-3">
      <button
        type="button"
        onClick={() => {
          setDuplicateWarning(null)
          setAllowDuplicate(true)  // triggers useEffect → resubmits
        }}
        className="px-4 py-2 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700"
      >
        Yes, email only — no portal access needed
      </button>
      <button
        type="button"
        onClick={() => {
          setDuplicateWarning(null)
          setAllowDuplicate(false)
        }}
        className="px-4 py-2 border border-amber-400 text-amber-700 text-sm rounded-md hover:bg-amber-50"
      >
        Cancel
      </button>
    </div>
  </div>
)}
      {/* Business Name */}
      <div>
        <label className={labelClass}>
          Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text" required value={form.business_name}
          onChange={e => set('business_name', e.target.value)}
          className={inputClass} placeholder="Deb's Cafe"
        />
      </div>

      {/* Contact Name */}
      <div>
        <label className={labelClass}>
          Contact Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text" required value={form.contact_name}
          onChange={e => set('contact_name', e.target.value)}
          className={inputClass} placeholder="Debbie Smith"
        />
      </div>

      {/* Email */}
      <div>
        <label className={labelClass}>
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email" required value={form.email}
          onChange={e => set('email', e.target.value)}
          className={inputClass} placeholder="deb@cafe.com.au"
          disabled={isEditing}
        />
        {isEditing && (
          <p className="text-xs text-gray-400 mt-1">
            Email cannot be changed after creation
          </p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label className={labelClass}>Phone</label>
        <input
          type="tel" value={form.phone}
          onChange={e => set('phone', e.target.value)}
          className={inputClass} placeholder="04xx xxx xxx"
        />
      </div>

      {/* Address */}
      <div>
        <label className={labelClass}>Delivery Address</label>
        <input
          type="text" value={form.address}
          onChange={e => set('address', e.target.value)}
          className={inputClass} placeholder="123 Main St, Suburb VIC 3000"
        />
      </div>

      {/* ABN */}
      <div>
        <label className={labelClass}>ABN</label>
        <input
          type="text" value={form.abn}
          onChange={e => set('abn', e.target.value)}
          className={inputClass} placeholder="12 345 678 901"
        />
      </div>

      {/* Payment Terms + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment Terms</label>
          <select
            value={form.payment_terms}
            onChange={e => set('payment_terms', Number(e.target.value))}
            className={inputClass}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className={inputClass}
          >
            <option value="active">✅ Active</option>
            <option value="pending">⏳ Pending</option>
            <option value="inactive">❌ Inactive</option>
          </select>
        </div>
      </div>

      {/* Delivery Notes */}
      <div>
        <label className={labelClass}>Delivery Notes</label>
        <textarea
          value={form.delivery_notes}
          onChange={e => set('delivery_notes', e.target.value)}
          className={inputClass} rows={3}
          placeholder="Leave at back door, call on arrival, etc."
        />
      </div>
            {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          id="customer-submit-btn"
          type="submit"
          disabled={loading}
          className="flex-1 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#006A4E' }}
        >
          {loading ? '💾 Saving...' : isEditing ? '✅ Update Customer' : '✨ Add Customer'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-6 py-3 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

    </form>
  )
}