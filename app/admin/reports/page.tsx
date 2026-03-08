export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft, TrendingDown, BarChart2, FileText } from 'lucide-react'

export default async function ReportsPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const reports = [
    {
      title: 'Weekly Report',
      description: 'Sales summary by week',
      href: '/admin/reports/weekly',
      icon: BarChart2,
      color: '#006A4E',
    },
    {
      title: 'Stales Analysis',
      description: 'Stale returns by product and customer',
      href: '/admin/reports/stales',
      icon: TrendingDown,
      color: '#CE1126',
    },
    {
      title: 'GST Report',
      description: 'GST collected by period',
      href: '/admin/gst-report',
      icon: FileText,
      color: '#0369a1',
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </a>

      <h1 className="text-3xl font-bold mb-8">Reports</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => {
          const Icon = r.icon
          return (
            <a
              key={r.href}
              href={r.href}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow group"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: r.color + '18' }}
              >
                <Icon className="h-5 w-5" style={{ color: r.color }} />
              </div>
              <h2 className="font-bold text-gray-900 group-hover:text-gray-700">
                {r.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{r.description}</p>
            </a>
          )
        })}
      </div>
    </div>
  )
}