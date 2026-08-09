'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Recall {
  id: string
  product_name: string
  reason: string
  severity: string
  date_from: string
  date_to: string
  status: string
  initiated_at: string
  initiated_by: string | null
  resolved_at: string | null
  notes: string | null
}

interface AffectedCustomer {
  id: string
  customer_id: string
  order_ids: string[]
  total_affected_value: number
  notification_sent_at: string | null
  customer_acknowledged_at: string | null
  product_returned: boolean
  credit_issued: boolean
  credit_amount: number | null
  replacement_issued: boolean
  notes: string | null
  customers: {
    business_name: string | null
    contact_name: string | null
    email: string | null
    email_2: string | null
    phone: string | null
    address: string | null
  }
}

export default function RecallDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [recall, setRecall] = useState<Recall | null>(null)
  const [affectedCustomers, setAffectedCustomers] = useState<AffectedCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    credit_issued: false,
    credit_amount: 0,
    product_returned: false,
    replacement_issued: false,
    notes: '',
  })

  useEffect(() => {
    fetchRecallDetails()
  }, [id])

  async function fetchRecallDetails() {
    try {
      const res = await fetch(`/api/admin/recalls/${id}`)
      const data = await res.json()
      setRecall(data.recall)
      setAffectedCustomers(data.affected_customers || [])
    } catch (error) {
      console.error('Error fetching recall:', error)
    } finally {
      setLoading(false)
    }
  }

  async function sendNotifications() {
    if (!confirm('Send recall notifications to all customers who have not been notified yet?')) {
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/admin/recalls/${id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      alert(`Notifications sent to ${data.sent_count} customer(s)`)
      fetchRecallDetails()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setSending(false)
    }
  }

  async function updateRecallStatus(newStatus: string) {
    try {
      const res = await fetch(`/api/admin/recalls/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update status')

      fetchRecallDetails()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  async function exportReport(format: 'csv' | 'pdf') {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/recalls/${id}/export?format=${format}`)
      
      if (!res.ok) throw new Error('Failed to export')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recall-report-${id.slice(0, 8)}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setExporting(false)
    }
  }

  function openEditCustomer(customer: AffectedCustomer) {
    setEditingCustomer(customer.id)
    setEditForm({
      credit_issued: customer.credit_issued,
      credit_amount: customer.credit_amount || 0,
      product_returned: customer.product_returned,
      replacement_issued: customer.replacement_issued,
      notes: customer.notes || '',
    })
  }

  async function saveCustomerUpdate(customerId: string) {
    try {
      const res = await fetch(`/api/admin/recalls/${id}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          ...editForm,
        }),
      })

      if (!res.ok) throw new Error('Failed to update')

      setEditingCustomer(null)
      fetchRecallDetails()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-gray-900"></div>
          <p className="mt-4 text-gray-600">Loading recall details...</p>
        </div>
      </div>
    )
  }

  if (!recall) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900">Recall not found</h1>
          <Link href="/admin/recalls" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            ← Back to Recalls
          </Link>
        </div>
      </div>
    )
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low': return 'bg-green-100 text-green-800 border-green-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const notifiedCount = affectedCustomers.filter(c => c.notification_sent_at).length
  const acknowledgedCount = affectedCustomers.filter(c => c.customer_acknowledged_at).length
  const creditIssuedCount = affectedCustomers.filter(c => c.credit_issued).length
  const totalValue = affectedCustomers.reduce((sum, c) => sum + c.total_affected_value, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/recalls" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Recalls
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getSeverityColor(recall.severity)}`}>
                  {recall.severity}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-800">
                  {recall.status}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{recall.product_name}</h1>
              <p className="text-gray-600 mt-2">{recall.reason}</p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => exportReport('csv')}
                disabled={exporting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={() => exportReport('pdf')}
                disabled={exporting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-3xl font-bold text-gray-900">{affectedCustomers.length}</div>
            <div className="text-sm text-gray-600 mt-1">Affected Customers</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-3xl font-bold text-blue-600">{notifiedCount}</div>
            <div className="text-sm text-gray-600 mt-1">Notified</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-3xl font-bold text-green-600">{creditIssuedCount}</div>
            <div className="text-sm text-gray-600 mt-1">Credits Issued</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-3xl font-bold text-orange-600">${totalValue.toFixed(2)}</div>
            <div className="text-sm text-gray-600 mt-1">Total Affected Value</div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={sendNotifications}
              disabled={sending || notifiedCount === affectedCustomers.length}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
            >
              {sending ? 'Sending...' : 'Send Notifications'}
            </button>
            
            {recall.status !== 'resolved' && (
              <button
                onClick={() => updateRecallStatus('resolved')}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
              >
                Mark as Resolved
              </button>
            )}
            
            {recall.status !== 'cancelled' && (
              <button
                onClick={() => updateRecallStatus('cancelled')}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Cancel Recall
              </button>
            )}
          </div>
        </div>

        {/* Affected Customers Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Affected Customers</h2>
          </div>
          
          {affectedCustomers.length === 0 ? (
            <div className="p-12 text-center text-gray-600">
              No customers were affected by this recall
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notified</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Credit</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Returned</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {affectedCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          {customer.customers.business_name || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-600">
                          {customer.customers.contact_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {customer.customers.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        ${customer.total_affected_value.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        {customer.notification_sent_at ? (
                          <span className="text-sm text-green-600 font-semibold">
                            {new Date(customer.notification_sent_at).toLocaleDateString('en-AU')}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">Not sent</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.credit_issued ? (
                          <span className="text-sm text-green-600 font-semibold">
                            ${customer.credit_amount?.toFixed(2) || '0.00'}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.product_returned ? (
                          <span className="text-sm text-green-600 font-semibold">Yes</span>
                        ) : (
                          <span className="text-sm text-gray-500">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingCustomer === customer.id ? (
                          <div className="space-y-2 min-w-[300px]">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editForm.credit_issued}
                                onChange={(e) => setEditForm({ ...editForm, credit_issued: e.target.checked })}
                                className="rounded"
                              />
                              <label className="text-sm">Credit Issued</label>
                              {editForm.credit_issued && (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.credit_amount}
                                  onChange={(e) => setEditForm({ ...editForm, credit_amount: parseFloat(e.target.value) || 0 })}
                                  className="w-24 px-2 py-1 text-sm border rounded"
                                  placeholder="Amount"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editForm.product_returned}
                                onChange={(e) => setEditForm({ ...editForm, product_returned: e.target.checked })}
                                className="rounded"
                              />
                              <label className="text-sm">Product Returned</label>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editForm.replacement_issued}
                                onChange={(e) => setEditForm({ ...editForm, replacement_issued: e.target.checked })}
                                className="rounded"
                              />
                              <label className="text-sm">Replacement Issued</label>
                            </div>
                            <textarea
                              value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              placeholder="Notes..."
                              rows={2}
                              className="w-full px-2 py-1 text-sm border rounded"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveCustomerUpdate(customer.customer_id)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingCustomer(null)}
                                className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 text-sm rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openEditCustomer(customer)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}