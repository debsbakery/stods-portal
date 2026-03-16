export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import AccountantSummaryView from './accountant-summary-view'

async function getAccountantData(month: string) {
  const supabase = createAdminClient()

  const startOfMonth = month + '-01'
  const endOfMonth = new Date(month + '-01')
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)
  const endStr = endOfMonth.toISOString().split('T')[0]

  // ── Sales ─────────────────────────────────────────────────────────────────
  const { data: salesData } = await supabase
    .from('orders')
    .select('total_amount')
    .gte('created_at', startOfMonth)
    .lt('created_at', endStr)
    .not('status', 'in', '("cancelled","draft")')

  const totalSales = salesData?.reduce((s, o) => s + Number(o.total_amount ?? 0), 0) ?? 0

  // ── GST ───────────────────────────────────────────────────────────────────
  const { data: gstData } = await supabase.rpc('get_monthly_gst', {
    start_date: startOfMonth,
    end_date:   endStr,
  }).single()

  const gstCollected = Number(gstData?.gst_collected ?? 0)

  // ── AR Transactions (invoices + credits only) ─────────────────────────────
  const { data: arData } = await supabase
    .from('ar_transactions')
    .select('type, amount')
    .gte('created_at', startOfMonth)
    .lt('created_at', endStr)

  const invoiced = arData
    ?.filter((t) => t.type === 'invoice')
    .reduce((s, t) => s + Number(t.amount ?? 0), 0) ?? 0

  const credits = arData
    ?.filter((t) => t.type === 'credit')
    .reduce((s, t) => s + Number(t.amount ?? 0), 0) ?? 0

  // ── Payments — from payments table ✅ ─────────────────────────────────────
  const { data: paymentsData } = await supabase
    .from('payments')
    .select('amount')
    .gte('payment_date', startOfMonth)
    .lt('payment_date', endStr)

  const payments = paymentsData?.reduce((s, p) => s + Number(p.amount ?? 0), 0) ?? 0

  // ── AR Balance (current total across all customers) ───────────────────────
  const { data: customers } = await supabase
    .from('customers')
    .select('balance')

  const arBalance = customers?.reduce((s, c) => s + Number(c.balance ?? 0), 0) ?? 0

  // ── Ingredient Purchases ──────────────────────────────────────────────────
  const { data: receipts } = await supabase
    .from('ingredient_receipts')
    .select('total_cost')
    .gte('received_date', startOfMonth)
    .lt('received_date', endStr)

  const ingredientCost = receipts?.reduce((s, r) => s + Number(r.total_cost ?? 0), 0) ?? 0

  // ── Latest Stock Value ────────────────────────────────────────────────────
  const { data: latestStock } = await supabase
    .from('stock_takes')
    .select(`
      take_date,
      items:stock_take_items (
        total_kg,
        ingredients ( unit_cost )
      )
    `)
    .eq('status', 'completed')
    .order('take_date', { ascending: false })
    .limit(1)
    .single()

  let stockValue = 0
  let stockDate  = null

  if (latestStock) {
    stockDate  = latestStock.take_date
    stockValue = (latestStock.items ?? []).reduce((sum, item: any) => {
      const kg   = Number(item.total_kg ?? 0)
      const cost = Number(item.ingredients?.unit_cost ?? 0)
      return sum + kg * cost
    }, 0)
  }

  return {
    month,
    totalSales,
    gstCollected,
    invoiced,
    credits,
    payments,
    arBalance,
    ingredientCost,
    stockValue,
    stockDate,
  }
}

export default async function AccountantSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const sp    = await searchParams
  const month = sp.month ?? new Date().toISOString().slice(0, 7)
  const data  = await getAccountantData(month)

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href="/admin/reports"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </a>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Accountant Monthly Summary</h1>
        <p className="text-gray-600 mt-1">
          Sales, AR, costs, and stock for month-end reporting
        </p>
      </div>
      <AccountantSummaryView data={data} />
    </div>
  )
}