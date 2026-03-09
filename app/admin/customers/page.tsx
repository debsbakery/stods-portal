// force-rebuild-v2
export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArrowLeft, Plus, Users, Edit } from 'lucide-react'
import Link from 'next/link'

export default async function AdminCustomersPage() {  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

const supabase = createAdminClient()
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, phone, status, balance, payment_terms')
    .order('business_name')

  if (error) console.error('Customers fetch error:', error)

  const statusColor = (status: string) => {
    if (status === 'active')   return 'bg-green-100 text-green-800'
    if (status === 'pending')  return 'bg-yellow-100 text-yellow-800'
    if (status === 'inactive') return 'bg-gray-100 text-gray-600'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: '#CE1126' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Customers</h1>
            <p className="text-gray-600">{customers?.length ?? 0} total customers</p>
          </div>
          <Link
            href="/admin/customers/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
            style={{ backgroundColor: '#006A4E' }}
          >
            <Plus className="h-5 w-5" />
            Add Customer
          </Link>
        </div>
      </div>

      {/* Status counts */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'active', 'pending', 'inactive'].map(s => (
          <span
            key={s}
            className="px-3 py-1 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-600"
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}{' '}
            <span className="text-gray-400">
              ({s === 'all'
                ? customers?.length ?? 0
                : customers?.filter(c => c.status === s).length ?? 0})
            </span>
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Business</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Terms</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Balance</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!customers || customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="mb-2">No customers yet</p>
                    <Link href="/admin/customers/create" className="text-green-700 underline">
                      Add your first customer
                    </Link>
                  </td>
                </tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{c.business_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contact_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.payment_terms ?? 30} days</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${
                      (c.balance ?? 0) > 0 ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      ${(c.balance ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${c.id}/edit`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-white text-xs font-semibold hover:opacity-90"
                        style={{ backgroundColor: '#006A4E' }}
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
