export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const end   = new Date(year, month, 0).toISOString().split('T')[0]
  return { start, end }
}

export default async function GSTReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase  = await createClient()
  const sp        = await searchParams
  const now       = new Date()
  const year      = parseInt(sp.year  || now.getFullYear().toString())
  const month     = parseInt(sp.month || (now.getMonth() + 1).toString())
  const { start, end } = getMonthRange(year, month)

  const monthName = new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  // Fetch order items with GST in period
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(`
      quantity,
      unit_price,
      subtotal,
      gst_applicable,
      order:orders!inner(
        delivery_date,
        status,
        customer_id
      )
    `)
    .eq('gst_applicable', true)
    .gte('order.delivery_date', start)
    .lte('order.delivery_date', end)
    .neq('order.status', 'cancelled')
 .in('order.status', ['invoiced', 'pending'])  // ← ADD explicit include
  // Fetch credit memo items with GST in period (negative GST)
  const { data: creditItems } = await supabase
    .from('credit_memo_items')
    .select(`
      quantity,
      unit_price,
      gst_amount,
      gst_applicable,
      credit_memo:credit_memos!inner(
        credit_date
      )
    `)
    .eq('gst_applicable', true)
    .gte('credit_memo.credit_date', start)
    .lte('credit_memo.credit_date', end)

  // Calculate GST
  const invoiceSubtotal = (orderItems || []).reduce((s, item) => {
    const sub = parseFloat(item.subtotal?.toString() || '0') ||
      (item.quantity * parseFloat(item.unit_price?.toString() || '0'))
    return s + Math.abs(sub)
  }, 0)

  const invoiceGst = invoiceSubtotal * 0.1

  const creditGst = (creditItems || []).reduce((s, item) => {
    return s + Math.abs(parseFloat(item.gst_amount?.toString() || '0'))
  }, 0)

  const netGst        = invoiceGst - creditGst
  const netSales      = invoiceSubtotal - (creditItems || []).reduce((s, i) => {
    const base = i.quantity * parseFloat(i.unit_price?.toString() || '0')
    return s + Math.abs(base)
  }, 0)

  // Build month options for selector
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(year, i, 1).toLocaleString('en-AU', { month: 'long' }),
  }))

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/admin" className="flex items-center gap-1 text-sm mb-4 hover:opacity-80" style={{ color: '#CE1126' }}>
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <h1 className="text-2xl font-bold mb-6" style={{ color: '#006A4E' }}>
        GST Report — BAS
      </h1>

      {/* Period selector */}
      <form method="GET" className="bg-white rounded-lg border p-4 mb-6 flex items-center gap-3 flex-wrap">
        <select
          name="month"
          defaultValue={month}
          className="border rounded px-3 py-2 text-sm"
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          name="year"
          defaultValue={year}
          className="border rounded px-3 py-2 text-sm"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 text-white text-sm rounded hover:opacity-90"
          style={{ backgroundColor: '#006A4E' }}
        >
          View
        </button>
      </form>

      {/* BAS Summary */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">{monthName}</h2>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-600">Taxable Sales (ex GST)</span>
            <span className="font-medium">{formatCurrency(invoiceSubtotal)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-600">GST on Sales (1A)</span>
            <span className="font-semibold text-lg" style={{ color: '#006A4E' }}>
              {formatCurrency(invoiceGst)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-600">GST Credits Issued</span>
            <span className="font-medium text-orange-600">({formatCurrency(creditGst)})</span>
          </div>
          <div className="flex justify-between items-center py-3 bg-gray-50 rounded px-3">
            <span className="font-bold text-lg">Net GST Payable</span>
            <span className="font-bold text-xl" style={{ color: '#CE1126' }}>
              {formatCurrency(netGst)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-gray-400 space-y-1">
          <p>Period: {start} to {end}</p>
          <p>Based on {orderItems?.length || 0} GST-applicable line items</p>
          <p>GST rate: 10% — figures exclude non-GST products (Manual Adjustment / code 900)</p>
        </div>
      </div>
    </div>
  )
}