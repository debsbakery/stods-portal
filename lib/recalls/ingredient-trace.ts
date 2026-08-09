/**
 * Resolves every product_id that an ingredient flows into, walking up
 * through sub-recipes. Mirrors the validated recursive CTE:
 *   ingredient -> recipe_lines / recipes.base_ingredient_id
 *             -> (up via recipe_lines.sub_recipe_id) -> recipes.product_id
 */
export async function resolveProductIdsForIngredient(
  supabase: any,
  ingredientId: string
): Promise<string[]> {
  const [{ data: recipeLines }, { data: recipes }] = await Promise.all([
    supabase.from('recipe_lines').select('recipe_id, ingredient_id, sub_recipe_id'),
    supabase.from('recipes').select('id, product_id, base_ingredient_id'),
  ])

  const lines = recipeLines || []
  const recs = recipes || []

  // Seed: recipes that use the ingredient directly, or have it as their base
  const affectedRecipeIds = new Set<string>()
  for (const l of lines) {
    if (l.ingredient_id === ingredientId && l.recipe_id) affectedRecipeIds.add(l.recipe_id)
  }
  for (const r of recs) {
    if (r.base_ingredient_id === ingredientId) affectedRecipeIds.add(r.id)
  }

  // Walk up: any recipe whose line references an already-affected sub-recipe
  let changed = true
  while (changed) {
    changed = false
    for (const l of lines) {
      if (
        l.sub_recipe_id &&
        l.recipe_id &&
        affectedRecipeIds.has(l.sub_recipe_id) &&
        !affectedRecipeIds.has(l.recipe_id)
      ) {
        affectedRecipeIds.add(l.recipe_id)
        changed = true
      }
    }
  }

  // Map affected recipes to their products
  const productIds = new Set<string>()
  for (const r of recs) {
    if (affectedRecipeIds.has(r.id) && r.product_id) productIds.add(r.product_id)
  }

  return Array.from(productIds)
}