'use client'

import { useState } from 'react'
import { Edit, Clock, Users, Search } from 'lucide-react'
import Link from 'next/link'

const statusColor = (status: string) => {
  if (status === 'active')   return 'bg-green-100 text-green-800'
  if (status === 'pending')  return 'bg-yellow-100 text-yellow-800'
  if (status === 'inactive') return 'bg-gray-100 text-gray-600'
  return 'bg-gray-100 text-gray-600'
}

export default function CustomersTable({ customers }: { customers: any[] }) {
  const [search,     setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = customers.filter(c => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch = !q
      || c.business_name?.toLowerCase().includes(q)
      || c.contact_name?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  return (
    <>
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search business, contact, email, phone..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'active', 'pending', 'inactive'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}{' '}
              <span className="opacity-70">
                ({s === 'all'
                  ? customers.length
                  : customers.filter(c => c.status === s).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {search && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </p>
      )}

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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p>{search ? `No customers match "${search}"` : 'No customers yet'}</p>
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
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
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/customers/${c.id}/edit`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-white text-xs font-semibold hover:opacity-90"
                          style={{ backgroundColor: '#3E1F00' }}
                        >
                          <Edit className="h-3 w-3" />Edit
                        </Link>
                        <Link
                          href={`/admin/customers/${c.id}/cutoff-settings`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-white text-xs font-semibold hover:opacity-90"
                          style={{ backgroundColor: '#1d4ed8' }}
                        >
                          <Clock className="h-3 w-3" />Cutoff
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}