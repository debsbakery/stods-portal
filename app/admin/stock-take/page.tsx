export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import StockTakeView from './stock-take-view'

async function getData() {
  const supabase = createAdminClient()

  // ✅ Added current_stock to the query
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, unit, unit_cost, current_stock')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const { data: stockTakes } = await supabase
    .from('stock_takes')
    .select('id, take_date, notes, status, created_at, completed_at')
    .order('take_date', { ascending: false })
    .limit(20)

  return {
    ingredients: (ingredients ?? []).map((i) => ({
      id:            i.id,
      name:          i.name,
      unit:          i.unit,
      unit_cost:     Number(i.unit_cost),
      current_stock: Number(i.current_stock ?? 0),  // ✅ Added
    })),
    stockTakes: (stockTakes ?? []).map((st) => ({
      id:           st.id,
      take_date:    st.take_date,
      notes:        st.notes,
      status:       st.status,
      created_at:   st.created_at,
      completed_at: st.completed_at,
    })),
  }
}

export default async function StockTakePage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { ingredients, stockTakes } = await getData()

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

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Stock Take</h1>
        <p className="text-gray-600 mt-1">
          Print blank sheet → count physical stock → enter counts → update inventory
        </p>
      </div>

      <StockTakeView
        ingredients={ingredients}
        initialStockTakes={stockTakes}
      />
    </div>
  )
}