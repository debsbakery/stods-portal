export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft, Clock, CheckCircle, User } from 'lucide-react'
import Link from 'next/link'
import InviteCustomerButton from '@/components/admin/InviteCustomerButton'

export default async function PendingCustomersPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  // Fixed: use createServiceClient (bypasses RLS) consistent with other admin pages
  const supabase = await createServiceClient()

  const { data: pending } = await supabase
    .from('customers')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const count = pending?.length ?? 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin"
        className="flex items-center gap-1 text-sm mb-5 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Clock className="h-6 w-6 text-orange-500" />
        <h1 className="text-2xl font-bold" style={{ color: '#006A4E' }}>
          Pending Approvals
        </h1>
        {count > 0 && (
          <span className="bg-orange-100 text-orange-700 text-sm font-semibold px-2.5 py-0.5 rounded-full">
            {count} waiting
          </span>
        )}
      </div>

      {count === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No pending applications</p>
          <p className="text-gray-400 text-sm mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending!.map(customer => (
            <div key={customer.id} className="bg-white rounded-lg border shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">

                {/* Customer details — unchanged */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{customer.business_name}</h3>
                    <p className="text-sm text-gray-500">{customer.contact_name}</p>
                    <p className="text-sm text-gray-500">{customer.email}</p>
                    {customer.phone && (
                      <p className="text-sm text-gray-500">{customer.phone}</p>
                    )}
                    {customer.address && (
                      <p className="text-sm text-gray-400 mt-1">{customer.address}</p>
                    )}
                    {customer.abn && (
                      <p className="text-xs text-gray-400">ABN: {customer.abn}</p>
                    )}
                    {customer.delivery_notes && (
                      <p className="text-xs text-blue-600 mt-1 italic">
                        Notes: {customer.delivery_notes}
                      </p>
                    )}
                    <p className="text-xs text-gray-300 mt-1">
                      Applied: {new Date(customer.created_at).toLocaleString('en-AU')}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 shrink-0">

                  <form action={`/api/admin/customers/${customer.id}/approve`} method="POST">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 w-full justify-center"
                      style={{ backgroundColor: '#006A4E' }}
                    >
                      <CheckCircle className="h-4 w-4" /> Approve
                    </button>
                  </form>

                  {/* Portal invite — only show if not already granted */}
                  <InviteCustomerButton
                    customerId={customer.id}
                    customerEmail={customer.email ?? null}
                    portalAccess={customer.portal_access ?? false}
                  />

                  <form action={`/api/admin/customers/${customer.id}/decline`} method="POST">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg bg-red-500 hover:bg-red-600 w-full justify-center"
                    >
                      Decline
                    </button>
                  </form>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}