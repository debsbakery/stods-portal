// force-rebuild-v2
export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'
import CustomersTable from './customers-table'

export default async function AdminCustomersPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, phone, status, balance, payment_terms')
    .order('business_name')

  if (error) console.error('Customers fetch error:', error)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: '#C4A882' }}
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
            style={{ backgroundColor: '#3E1F00' }}
          >
            <Plus className="h-5 w-5" />
            Add Customer
          </Link>
        </div>
      </div>

      <CustomersTable customers={customers ?? []} />
    </div>
  )
}