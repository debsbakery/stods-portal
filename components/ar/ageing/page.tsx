import { createClient } from '@/lib/supabase/server'
import { AgingTable } from '@/components/ar/ageing-table'
import { ReminderControls } from '@/components/ar/reminder-controls'
import Link from 'next/link'

export default async function ArDashboard() {
  const supabase = await createClient()

  // Get summary stats
  const { data: customers } = await supabase
    .from('customers')
    .select('balance')
    .gt('balance', 0)

  const totalBalance = customers?.reduce((sum, c) => sum + parseFloat(c.balance || '0'), 0) || 0
  const customersWithBalance = customers?.length || 0

  // Get overdue invoices
  const today = new Date().toISOString().split('T')[0]
  const { data: overdueInvoices } = await supabase
    .from('ar_transactions')
    .select('id')
    .eq('type', 'invoice')
    .is('paid_date', null)
    .lt('due_date', today)

  const overdueCount = overdueInvoices?.length || 0

  // Get recent emails (if ar_emails table exists)
  const { data: recentEmails } = await supabase
    .from('ar_emails')
    .select(`
      id,
      type,
      status,
      sent_at,
      customer:customers(business_name)
    `)
    .order('sent_at', { ascending: false })
    .limit(10)

  // Get aging data
  const { data: agingData } = await supabase
    .from('customer_ar_summary')
    .select('*')
    .order('total_balance', { ascending: false })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount)
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Accounts Receivable Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Total Outstanding</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {formatCurrency(totalBalance)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Customers w/ Balance</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {customersWithBalance}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Overdue Invoices</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">
            {overdueCount}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              href="/admin/ar"
              className="block px-4 py-2 bg-blue-600 text-white text-center rounded hover:bg-blue-700"
            >
              View Full AR Dashboard
            </Link>
            <Link
              href="/admin/customers"
              className="block px-4 py-2 bg-gray-600 text-white text-center rounded hover:bg-gray-700"
            >
              Customer List
            </Link>
          </div>
        </div>

        <ReminderControls />
      </div>

      {/* Aging Report */}
      {agingData && agingData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h3 className="text-lg font-semibold mb-4">AR Aging Summary</h3>
 <AgingTable 
  data={agingData.map((row: any) => ({
    id: row.customer_id,
    name: row.business_name || 'Unknown Customer',
    email: row.email || '',
    paymentTerms: row.payment_terms || 'Net 30',
    current: parseFloat(row.current || '0'),
    days1To30: parseFloat(row.days_1_30 || '0'),
    days31To60: parseFloat(row.days_31_60 || '0'),
    days61To90: parseFloat(row.days_61_90 || '0'),
    over90Days: parseFloat(row.days_over_90 || '0'),
    daysOver90: parseFloat(row.days_over_90 || '0'),
    totalBalance: parseFloat(row.total_due || '0'),
    totalDue: parseFloat(row.total_due || '0'),
    updatedAt: new Date().toISOString()
  })) as any}
/>
        </div>
      )}

      {/* Recent Email Activity */}
      {recentEmails && recentEmails.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recent Email Activity</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Customer</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {recentEmails.map((email: any) => (
                  <tr key={email.id} className="border-b">
                    <td className="py-2">{email.customer?.business_name || 'Unknown'}</td>
                    <td className="py-2">
                      <span className="px-2 py-1 text-xs rounded bg-gray-100">
                        {email.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        email.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {email.status}
                      </span>
                    </td>
                    <td className="py-2 text-sm text-gray-600">
                      {new Date(email.sent_at).toLocaleString('en-AU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!recentEmails || recentEmails.length === 0) && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recent Email Activity</h3>
          <p className="text-gray-500">No recent email activity</p>
        </div>
      )}
    </div>
  )
}