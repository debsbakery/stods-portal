export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import StalesReportView from './stales-report-view'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStalesData(from?: string, to?: string) {
  const supabase = createAdminClient()

  let staleQuery = supabase
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

  if (from) staleQuery = staleQuery.gte('created_at', from)
  if (to)   staleQuery = staleQuery.lte('created_at', to + 'T23:59:59')

  const { data: staleItems, error } = await staleQuery
  if (error) throw new Error(error.message)

  const items = staleItems ?? []

  // Fetch sales totals for all products that appear in stales
  const productCodes = [...new Set(
    items.map((i) => i.product_code).filter(Boolean)
  )]

  let salesByCode: Record<string, { total_sold: number; total_revenue: number }> = {}

  if (productCodes.length > 0) {
    const { data: salesData } = await supabase
      .from('order_items')
      .select('product_id, quantity, unit_price, products!inner( code )')
      .in('products.code', productCodes)

    for (const row of salesData ?? []) {
      const code = (row.products as any)?.code
      if (!code) continue
      if (!salesByCode[code]) salesByCode[code] = { total_sold: 0, total_revenue: 0 }
      salesByCode[code].total_sold    += Number(row.quantity ?? 0)
      salesByCode[code].total_revenue += Number(row.unit_price ?? 0) * Number(row.quantity ?? 0)
    }
  }

  const byProduct: Record<string, {
    product_name: string
    product_code: string
    total_quantity: number
    total_value: number
    total_sold: number
    total_revenue: number
  }> = {}

  const byCustomer: Record<string, {
    customer_id: string
    business_name: string
    total_quantity: number
    total_value: number
    total_sold: number
  }> = {}

  for (const item of items) {
    const val    = Math.abs(Number(item.line_total ?? 0))
    const qty    = Number(item.quantity ?? 0)
    const memo   = item.credit_memo as any
    const custId = memo?.customer?.id ?? 'unknown'
    const custName = memo?.customer?.business_name ?? 'Unknown'
    const prodKey  = item.product_name ?? 'Unknown'
    const code     = item.product_code ?? ''
    const sales    = salesByCode[code] ?? { total_sold: 0, total_revenue: 0 }

    if (!byProduct[prodKey]) {
      byProduct[prodKey] = {
        product_name:  prodKey,
        product_code:  code,
        total_quantity: 0,
        total_value:    0,
        total_sold:     sales.total_sold,
        total_revenue:  sales.total_revenue,
      }
    }
    byProduct[prodKey].total_quantity += qty
    byProduct[prodKey].total_value    += val

    if (!byCustomer[custId]) {
      byCustomer[custId] = {
        customer_id:    custId,
        business_name:  custName,
        total_quantity: 0,
        total_value:    0,
        total_sold:     0,
      }
    }
    byCustomer[custId].total_quantity += qty
    byCustomer[custId].total_value    += val
  }

  const totalValue = items.reduce((s, i) => s + Math.abs(Number(i.line_total ?? 0)), 0)
  const totalQty   = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0)

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

  const sp   = await searchParams
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
        <p className="text-gray-600 mt-1">Stale returns by product and customer</p>
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