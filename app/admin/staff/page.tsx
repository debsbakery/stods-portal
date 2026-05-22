// app/admin/staff/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { Users, Plus } from 'lucide-react'

const DEPT_LABELS: Record<string, string> = {
  production: '🍞 Production',
  shop:       '🛒 Shop',
  delivery:   '🚚 Delivery',
  admin:      '📋 Admin',
  management: '👔 Management',
}

const TYPE_LABELS: Record<string, string> = {
  fixed:       'Fixed',
  fixed_start: 'Fixed Start',
  casual:      'Casual',
  salary:      'Salary',
}

function fmtRate(staff: any): string {
  if (staff.employment_type === 'salary') {
    return staff.salary_weekly
      ? `$${Number(staff.salary_weekly).toFixed(0)}/wk`
      : 'Salary'
  }
  return staff.base_hourly_rate
    ? `$${Number(staff.base_hourly_rate).toFixed(2)}/hr`
    : '—'
}

export default async function StaffPage() {
  if (!(await checkAdmin())) redirect('/')

  const supabase = createAdminClient()
  const { data: staffList } = await supabase
    .from('staff')
    .select('*')
    .order('name')

  const active   = (staffList ?? []).filter(s => s.active)
  const inactive = (staffList ?? []).filter(s => !s.active)

  const totalWeeklyCost = active.reduce((sum, s) => {
    if (s.employment_type === 'salary') return sum + Number(s.salary_weekly ?? 0)
    // Estimate: assume 38hrs/wk for hourly
    return sum + (Number(s.true_hourly_cost ?? 0) * 38)
  }, 0)

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-7 w-7 text-green-600" />
          Staff Management
        </h1>
        <Link href="/admin/staff/new"
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white
                     rounded-lg text-sm font-medium hover:bg-green-700">
          <Plus className="h-4 w-4" /> Add Staff Member
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">Active Staff</p>
          <p className="text-2xl font-bold text-gray-800">{active.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">Est. Weekly Labour Cost</p>
          <p className="text-2xl font-bold text-amber-700">
            ${totalWeeklyCost.toFixed(0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">incl. super + leave loading</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">By Department</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {['production','shop','delivery','admin','management'].map(dept => {
              const count = active.filter(s => s.primary_department === dept).length
              if (!count) return null
              return (
                <span key={dept} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {DEPT_LABELS[dept]} {count}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Active staff table */}
      <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Department</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Rate</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">True Cost/hr</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Break</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Role</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {active.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No staff yet — click Add Staff Member to get started
                </td>
              </tr>
            )}
            {active.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs">
                    {DEPT_LABELS[s.primary_department] ?? s.primary_department}
                  </span>
                  {s.secondary_department && (
                    <span className="ml-1 text-xs text-gray-400">
                      + {DEPT_LABELS[s.secondary_department]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.employment_type === 'salary'      ? 'bg-purple-100 text-purple-700' :
                    s.employment_type === 'fixed'       ? 'bg-blue-100 text-blue-700' :
                    s.employment_type === 'fixed_start' ? 'bg-cyan-100 text-cyan-700' :
                                                          'bg-gray-100 text-gray-700'
                  }`}>
                    {TYPE_LABELS[s.employment_type] ?? s.employment_type}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm">{fmtRate(s)}</td>
                <td className="px-4 py-3">
                  {s.true_hourly_cost
                    ? <span className="text-amber-700 font-medium">
                        ${Number(s.true_hourly_cost).toFixed(2)}/hr
                      </span>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {s.break_minutes === 0 ? 'None'
                    : s.break_minutes === 30 ? '30 min'
                    : '60 min'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.role === 'admin'   ? 'bg-red-100 text-red-700' :
                    s.role === 'manager' ? 'bg-amber-100 text-amber-700' :
                                          'bg-gray-100 text-gray-600'
                  }`}>
                    {s.role}
                  </span>
                </td>

                <td className="px-4 py-3 text-right whitespace-nowrap">
               <span className="text-gray-300 text-sm ml-2" title="Hours — coming soon">
  Hours
</span>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={`/admin/staff/${s.id}`}
                    className="text-blue-600 hover:underline text-sm font-medium">
                    Edit
                  </Link>
                </td>       <span className="text-gray-300 text-sm cursor-not-allowed ml-1" title="Hours — Stage 4">
                    Hours
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inactive staff (collapsed) */}
      {inactive.length > 0 && (
        <details className="bg-white rounded-xl shadow">
          <summary className="px-4 py-3 cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            {inactive.length} inactive staff member{inactive.length !== 1 ? 's' : ''}
          </summary>
          <table className="w-full text-sm border-t">
            <tbody className="divide-y">
              {inactive.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 opacity-60">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 text-gray-500">{s.employment_type}</td>
                  <td className="px-4 py-2 text-gray-500">{s.end_date ?? 'No end date'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/staff/${s.id}`}
                      className="text-blue-600 hover:underline text-sm">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

    </div>
  )
}