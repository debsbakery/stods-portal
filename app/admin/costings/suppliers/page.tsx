export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import SuppliersView from './suppliers-view'

async function getData() {
  const supabase = createAdminClient()

  const [{ data: suppliers }, { data: ingredientCounts }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('ingredients')
      .select('supplier_id')
      .not('supplier_id', 'is', null),
  ])

  // Count ingredients per supplier
  const counts: Record<string, number> = {}
  for (const i of ingredientCounts ?? []) {
    counts[i.supplier_id] = (counts[i.supplier_id] || 0) + 1
  }

  return {
    suppliers: (suppliers ?? []).map(s => ({
      ...s,
      ingredient_count: counts[s.id] || 0,
    })),
  }
}

export default async function SuppliersPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { suppliers } = await getData()

  return <SuppliersView suppliers={suppliers} />
}