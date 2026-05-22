// app/admin/staff/[id]/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import StaffForm from '../components/staff-form'

interface Props { params: { id: string } }

export default async function EditStaffPage({ params }: Props) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!staff) redirect('/admin/staff')

  const { data: history } = await supabase
    .from('staff_pay_history')
    .select('*')
    .eq('staff_id', params.id)
    .order('effective_from', { ascending: false })

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin/staff"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        ← Back to Staff
      </Link>
      <h1 className="text-3xl font-bold mb-6">Edit — {staff.name}</h1>

      <StaffForm staff={staff} isEditing />

      {history && history.length > 0 && (
        <div className="mt-8 bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Pay Rate History</h2>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Effective From</th>
                <th className="text-left px-3 py-2">To</th>
                <th className="text-right px-3 py-2">Base Rate</th>
                <th className="text-right px-3 py-2">True Cost/hr</th>
                <th className="text-left px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h: any) => (
                <tr key={h.id} className={!h.effective_to ? 'bg-green-50' : ''}>
                  <td className="px-3 py-2">
                    {new Date(h.effective_from + 'T00:00:00').toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {h.effective_to
                      ? new Date(h.effective_to + 'T00:00:00').toLocaleDateString('en-AU')
                      : <span className="text-green-600 font-medium">Current</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.base_hourly_rate
                      ? `$${Number(h.base_hourly_rate).toFixed(2)}/hr`
                      : h.salary_weekly
                        ? `$${Number(h.salary_weekly).toFixed(0)}/wk`
                        : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-amber-700">
                    {h.true_hourly_cost
                      ? `$${Number(h.true_hourly_cost).toFixed(2)}/hr`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {h.change_reason ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}