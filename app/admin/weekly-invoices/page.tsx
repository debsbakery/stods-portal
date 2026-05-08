// app/admin/weekly-invoices/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import GenerateWeeklyButton from './generate-button'
import { CalendarDays, FileText } from 'lucide-react'

function fmtAUD(n: number | string | null | undefined) {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v)
}

function fmtDate(s?: string | null) {
  if (!s) return '-'
  return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-AU')
}

export default async function WeeklyInvoicesPage() {
  if (!(await checkAdmin())) redirect('/')

  const supabase = createAdminClient()

  // Pull weekly invoices + linked customers
  const { data: weeklies } = await supabase
    .from('weekly_invoices')
    .select(`
      id, invoice_number, week_start, week_end, total_amount, amount_paid,
      status, issued_at, revised_at, due_date,
      customer:customers ( id, business_name )
    `)
    .order('issued_at', { ascending: false })
    .limit(200)

  // Pull weekly-billing customers for the manual generate dropdown
  const { data: weeklyCustomers } = await supabase
    .from('customers')
    .select('id, business_name')
    .eq('invoice_frequency', 'weekly')
    .order('business_name')

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-7 w-7 text-purple-600" />
          Weekly Invoices
        </h1>

        <GenerateWeeklyButton customers={weeklyCustomers ?? []} />
      </div>

      {(!weeklies || weeklies.length === 0) ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="font-medium">No weekly invoices yet.</p>
          <p className="text-sm mt-1">
            Customers must be set to <span className="font-mono">weekly</span> billing first.
            Then click <strong>Generate</strong> above to create one.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Invoice #</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Week</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Total</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Paid</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Due</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {weeklies.map((w: any) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">
                    {w.invoice_number ? String(w.invoice_number).padStart(6, '0') : '—'}
                  </td>
                  <td className="px-4 py-3">{w.customer?.business_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {fmtDate(w.week_start)} → {fmtDate(w.week_end)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtAUD(w.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtAUD(w.amount_paid)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(w.due_date)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/weekly-invoices/${w.id}`}
                      className="text-purple-600 hover:underline text-sm font-medium"
                    >
                      View
                    </Link>
                    <a
                      href={`/api/admin/weekly-invoices/${w.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="ml-3 text-blue-600 hover:underline text-sm font-medium"
                    >
                      PDF
                    </a>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    issued:    'bg-blue-100 text-blue-700',
    revised:   'bg-amber-100 text-amber-700',
    paid:      'bg-green-100 text-green-700',
    cancelled: 'bg-gray-200 text-gray-500',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.toUpperCase()}
    </span>
  )
}