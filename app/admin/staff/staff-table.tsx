'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

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

export default function StaffTable({ active, inactive }: { active: any[]; inactive: any[] }) {
  const [search, setSearch] = useState('')

  const filtered = active.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.name?.toLowerCase().includes(q) ||
      s.primary_department?.toLowerCase().includes(q) ||
      s.employment_type?.toLowerCase().includes(q) ||
      s.role?.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, department, type, role..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {search && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </p>
      )}

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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {search ? `No staff match "${search}"` : 'No staff yet'}
                </td>
              </tr>
            )}
            {filtered.map((s: any) => (
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
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/staff/${s.id}`}
                    className="text-blue-600 hover:underline text-sm font-medium">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inactive staff */}
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
    </>
  )
}