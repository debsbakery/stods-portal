export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import BulkWeightsView from './bulk-weights-view'

export default async function BulkWeightsPage() {
  const supabase = createAdminClient()

  const { data: products } = await supabase
    .from('products')
    .select('id, name, code, category, price, weight_grams, labour_pct')
    .eq('is_available', true)
    .order('code', { ascending: true, nullsFirst: false })

  return <BulkWeightsView products={products ?? []} />
}