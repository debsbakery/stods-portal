export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import RecipesView from './recipes-view'

export default async function RecipesPage() {
  const supabase = createAdminClient()

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select(`
      *,
      products (
        id,
        name,
        code
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Failed to load recipes: {error.message}
      </div>
    )
  }

  return <RecipesView recipes={recipes ?? []} />
}