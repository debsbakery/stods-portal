export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import StalesReportView from './stales-report-view'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStalesData(from?: string, to?: string) {
  const supabase = createAdminClient()

  let query = supabase
    .from('credit_memo_items')
    .select(`
      id,
      product_name,
      product_code,
      quantity,
      unit_price,
      credit_percent,
      line_total,
      credit_type,
      credit_memo:credit_memos (
        id,
        credit_number,
        credit_date,
        status,
        customer:customers ( id, business_name, contact_name )
      )
    `)
    .eq('credit_type', 'stale_return')
    .order('product_name', { ascending: true })

  if (from) query = query.gte('created_at', from)
  if (to)   query = query.lte('created_at', to + 'T23:59:59')

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const items = data ?? []

  const byProduct: Record<string, {
    product_name: string
    product_code: string
    total_quantity: number
    total_value: number
    occurrences: number
  }> = {}

  const byCustomer: Record<string, {
    customer_id: string
    business_name: string
    total_quantity: number
    total_value: number
    occurrences: number
  }> = {}

  for (const item of items) {
    const val = Math.abs(Number(item.line_total ?? 0))
    const qty = Number(item.quantity ?? 0)
    const memo = item.credit_memo as any
    const custId = memo?.customer?.id ?? 'unknown'
    const custName = memo?.customer?.business_name ?? 'Unknown'
    const prodKey = item.product_name ?? 'Unknown'

    if (!byProduct[prodKey]) {
      byProduct[prodKey] = {
        product_name: prodKey,
        product_code: item.product_code ?? '',
        total_quantity: 0,
        total_value: 0,
        occurrences: 0,
      }
    }
    byProduct[prodKey].total_quantity += qty
    byProduct[prodKey].total_value    += val
    byProduct[prodKey].occurrences    += 1

    if (!byCustomer[custId]) {
      byCustomer[custId] = {
        customer_id: custId,
        business_name: custName,
        total_quantity: 0,
        total_value: 0,
        occurrences: 0,
      }
    }
    byCustomer[custId].total_quantity += qty
    byCustomer[custId].total_value    += val
    byCustomer[custId].occurrences    += 1
  }

  const totalValue = items.reduce(
    (s, i) => s + Math.abs(Number(i.line_total ?? 0)), 0
  )
  const totalQty = items.reduce(
    (s, i) => s + Number(i.quantity ?? 0), 0
  )

  return {
    items,
    byProduct: Object.values(byProduct).sort((a, b) => b.total_value - a.total_value),
    byCustomer: Object.values(byCustomer).sort((a, b) => b.total_value - a.total_value),
    totalValue,
    totalQty,
  }
}

export default async function StalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const sp = await searchParams
  const from = sp.from
  const to   = sp.to

  const data = await getStalesData(from, to)

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
        <h1 className="text-3xl font-bold">Stales Analysis</h1>
        <p className="text-gray-600 mt-1">
          Stale returns by product and customer
        </p>
      </div>

      <StalesReportView
        items={data.items}
        byProduct={data.byProduct}
        byCustomer={data.byCustomer}
        totalValue={data.totalValue}
        totalQty={data.totalQty}
        fromDate={from ?? ''}
        toDate={to ?? ''}
      />
    </div>
  )
}