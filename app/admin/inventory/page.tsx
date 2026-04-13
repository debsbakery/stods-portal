export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import InventoryDashboard from './inventory-dashboard'

async function getData() {
  const supabase = createAdminClient()

  const [
    { data: ingredients },
    { data: receipts },
    { data: suppliers },
    { data: consumption },
  ] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, unit_cost, current_stock, reorder_point, supplier_id, suppliers ( id, name )')
      .order('name', { ascending: true }),
    supabase
      .from('ingredient_receipts')
      .select(`
        id, ingredient_id, supplier_id, supplier,
        quantity_kg, unit_cost, total_cost,
        invoice_ref, received_date, notes, created_at,
        ingredients ( id, name, unit ),
        suppliers ( id, name )
      `)
      .order('received_date', { ascending: false })
      .limit(100),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('ingredient_consumption')
      .select('*'),
  ])

  // Build usage map
  const usageMap: Record<string, {
    daily_avg: number
    weekly_avg: number
    days_remaining: number | null
    weeks_remaining: number | null
  }> = {}

  for (const c of consumption ?? []) {
    const dailyAvg = (c.kg_used_last_30_days || 0) / 30
    const weeklyAvg = dailyAvg * 7
    const ing = (ingredients ?? []).find((i: any) => i.id === c.ingredient_id)
    const stock = ing?.current_stock ?? 0

    let daysRemaining: number | null = null
    let weeksRemaining: number | null = null

    if (dailyAvg > 0 && stock > 0) {
      daysRemaining = Math.round(stock / dailyAvg)
      weeksRemaining = Math.round((stock / weeklyAvg) * 10) / 10
    }

    usageMap[c.ingredient_id] = {
      daily_avg: Math.round(dailyAvg * 100) / 100,
      weekly_avg: Math.round(weeklyAvg * 100) / 100,
      days_remaining: daysRemaining,
      weeks_remaining: weeksRemaining,
    }
  }

  const enrichedIngredients = (ingredients ?? []).map((i: any) => ({
    ...i,
    usage: usageMap[i.id] || null,
  }))

  return {
    ingredients: enrichedIngredients,
    receipts: receipts ?? [],
    suppliers: suppliers ?? [],
  }
}

export default async function InventoryPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { ingredients, receipts, suppliers } = await getData()

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

      <div className="flex gap-2 mb-4">
        <a
          href="/suppliers"
          className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Building2 className="h-4 w-4" />
          Manage Suppliers
        </a>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">📦 Inventory Management</h1>
        <p className="text-gray-600 mt-1">
          Stock levels, deliveries &amp; ingredient usage
        </p>
      </div>

      <InventoryDashboard
        ingredients={ingredients as any}
        initialReceipts={receipts as any}
        suppliers={suppliers as any}
      />
    </div>
  )
}