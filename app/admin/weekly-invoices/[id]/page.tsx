// app/admin/weekly-invoices/[id]/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Download, CalendarDays } from 'lucide-react'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: { id: string } }

function fmtAUD(n: number | string | null | undefined) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(Number(n ?? 0))
}
function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-AU')
}

export default async function WeeklyInvoiceDetailPage({ params }: Props) {
  if (!(await checkAdmin())) redirect('/')

  const supabase = createAdminClient()

  const { data: weekly, error } = await supabase
    .from('weekly_invoices')
    .select(`
      *,
      customer:customers ( id, business_name, email, address, phone, abn, payment_terms )
    `)
    .eq('id', params.id)
    .single()

  if (error || !weekly) redirect('/admin/weekly-invoices')

  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', params.id)

  const orderIds = (links ?? []).map((l: any) => l.order_id)

  const { data: orders } = await supabase
    .from('orders')
    .select('id, delivery_date, invoice_number, total_amount, status, purchase_order_number')
    .in('id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
    .order('delivery_date', { ascending: true })

  const invoiceNum = weekly.invoice_number
    ? String(weekly.invoice_number).padStart(6, '0')
    : 'DRAFT'

  const STATUS_COLOUR: Record<string, string> = {
    issued:    'bg-blue-100 text-blue-700',
    revised:   'bg-amber-100 text-amber-700',
    paid:      'bg-green-100 text-green-700',
    cancelled: 'bg-gray-200 text-gray-500',
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin/weekly-invoices"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Weekly Invoices
      </Link>

      <div className="bg-white rounded-xl shadow p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-purple-600" />
              Weekly Invoice #{invoiceNum}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {fmtDate(weekly.week_start)} → {fmtDate(weekly.week_end)}
            </p>
            {weekly.status === 'revised' && weekly.revised_at && (
              <p className="text-amber-600 text-xs mt-1">
                ⚠️ Revised {fmtDate(weekly.revised_at)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full
              ${STATUS_COLOUR[weekly.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {weekly.status.toUpperCase()}
            </span>
            <a
              href={`/api/admin/weekly-invoices/${weekly.id}/pdf`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white
                         rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>
        </div>

        {/* Customer + totals */}
        <div className="grid grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Bill To</p>
            <p className="font-bold">{weekly.customer?.business_name}</p>
            <p className="text-sm text-gray-600">{weekly.customer?.email}</p>
            {weekly.customer?.address && (
              <p className="text-sm text-gray-600">{weekly.customer.address}</p>
            )}
            {weekly.customer?.abn && (
              <p className="text-sm text-gray-600 mt-1">ABN: {weekly.customer.abn}</p>
            )}
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Invoice Totals</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal (ex GST)</span>
                <span>{fmtAUD(Number(weekly.total_amount) - Number(weekly.gst_amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">GST (10%)</span>
                <span>{fmtAUD(weekly.gst_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
                <span>TOTAL</span>
                <span>{fmtAUD(weekly.total_amount)}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs pt-1">
                <span>Paid</span>
                <span>{fmtAUD(weekly.amount_paid)}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Due</span>
                <span>{fmtDate(weekly.due_date)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery days table */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">
            📦 Deliveries This Week ({orders?.length ?? 0})
          </p>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Delivery Date</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Daily Invoice #</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">PO Number</th>
                <th className="text-right px-4 py-2 font-medium text-gray-700">Total</th>
                <th className="text-center px-4 py-2 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(orders ?? []).map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    {new Date(o.delivery_date + 'T00:00:00')
                      .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-600">
                    {o.invoice_number
                      ? `#${String(o.invoice_number).padStart(6,'0')}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {o.purchase_order_number ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{fmtAUD(o.total_amount)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${o.status === 'invoiced' ? 'bg-green-100 text-green-700'
                        : o.status === 'cancelled' ? 'bg-gray-200 text-gray-500'
                        : 'bg-blue-100 text-blue-700'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}