export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import IngredientsView from './ingredients-view'

export default async function IngredientsPage() {
  const supabase = createAdminClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Failed to load ingredients: {error.message}
      </div>
    )
  }

  return <IngredientsView ingredients={ingredients ?? []} />
}