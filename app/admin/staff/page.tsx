export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { Users, Plus, ArrowLeft } from 'lucide-react'
import StaffTable from './staff-table'

const DEPT_LABELS: Record<string, string> = {
  production: '🍞 Production',
  shop:       '🛒 Shop',
  delivery:   '🚚 Delivery',
  admin:      '📋 Admin',
  management: '👔 Management',
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
    return sum + (Number(s.true_hourly_cost ?? 0) * 38)
  }, 0)

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">

      {/* Back button */}
      <Link
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#3E1F00' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </Link>

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

      <StaffTable active={active} inactive={inactive} />

    </div>
  )
}