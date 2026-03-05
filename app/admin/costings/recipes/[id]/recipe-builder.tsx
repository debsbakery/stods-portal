'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit_cost: number
}

interface Recipe {
  id: string
  product_id: string | null
  base_ingredient_id: string | null
  products?: {
    id: string
    name: string
    code: string | null
    weight_grams: number | null
  } | null
}

interface RecipeLine {
  id: string
  recipe_id: string
  ingredient_id: string | null
  quantity_grams: number | null
  sub_recipe_id: string | null
  sub_qty_grams: number | null
  ingredients?: {
    id: string
    name: string
    unit_cost: number
  } | null
  sub_recipes?: {
    id: string
    products?: {
      name: string
    } | null
  } | null
}

interface Props {
  recipe: Recipe
  lines: RecipeLine[]
  allIngredients: Ingredient[]
  allRecipes: any[]
}

export default function RecipeBuilder({ recipe, lines: initialLines, allIngredients, allRecipes }: Props) {
  const router = useRouter()
  const [lines, setLines] = useState<RecipeLine[]>(initialLines)
  const [baseIngredientId, setBaseIngredientId] = useState(recipe.base_ingredient_id || '')
  const [savingBase, setSavingBase] = useState(false)

  const [newLine, setNewLine] = useState({
    type: 'ingredient' as 'ingredient' | 'sub_recipe',
    ingredient_id: '',
    sub_recipe_id: '',
    quantity_grams: '',
  })
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function saveBaseIngredient() {
    setSavingBase(true)

    await fetch(`/api/admin/recipes/${recipe.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_ingredient_id: baseIngredientId || null }),
    })

    setSavingBase(false)
    router.refresh()
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)

    const payload =
      newLine.type === 'ingredient'
        ? {
            ingredient_id: newLine.ingredient_id,
            quantity_grams: parseInt(newLine.quantity_grams),
            sub_recipe_id: null,
            sub_qty_grams: null,
          }
        : {
            ingredient_id: null,
            quantity_grams: null,
            sub_recipe_id: newLine.sub_recipe_id,
            sub_qty_grams: parseInt(newLine.quantity_grams),
          }

    const res = await fetch(`/api/admin/recipes/${recipe.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setAdding(false)

    if (res.ok) {
      setNewLine({ type: 'ingredient', ingredient_id: '', sub_recipe_id: '', quantity_grams: '' })
      router.refresh()
    } else {
      alert('Failed to add line')
    }
  }

  async function deleteLine(lineId: string) {
    if (!confirm('Delete this line?')) return
    setDeleting(lineId)

    await fetch(`/api/admin/recipes/${recipe.id}/lines`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_id: lineId }),
    })

    setDeleting(null)
    router.refresh()
  }

  const totalWeight = lines.reduce((sum, line) => {
    return sum + (line.quantity_grams || line.sub_qty_grams || 0)
  }, 0)

  const totalCost = lines.reduce((sum, line) => {
    if (line.ingredient_id && line.ingredients) {
      return sum + ((line.quantity_grams || 0) / 1000) * line.ingredients.unit_cost
    }
    return sum
  }, 0)

  const costPerKg = totalWeight > 0 ? (totalCost / (totalWeight / 1000)) : 0

  return (
    <div className="space-y-6 max-w-4xl">

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/costings/recipes')}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {recipe.products?.name || 'Base Recipe'}
          </h1>
          {recipe.products?.code && (
            <p className="text-sm text-gray-400 font-mono">#{recipe.products.code}</p>
          )}
        </div>
      </div>

      {/* Base Ingredient Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Base Ingredient (for scaling)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Select the flour or main ingredient used as the scaling reference when printing recipes at different weights.
        </p>
        <div className="flex gap-3">
          <select
            value={baseIngredientId}
            onChange={(e) => setBaseIngredientId(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Select base ingredient —</option>
            {allIngredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name}
              </option>
            ))}
          </select>
          <button
            onClick={saveBaseIngredient}
            disabled={savingBase}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
          >
            {savingBase ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Recipe Lines */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Recipe Lines</h2>
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No ingredients yet — add one below.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Ingredient / Sub-Recipe</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Quantity (g)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Cost</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {line.ingredient_id ? (
                      <span className="font-medium text-gray-900">{line.ingredients?.name}</span>
                    ) : (
                      <span className="text-indigo-600 font-medium">
                        {line.sub_recipes?.products?.name || 'Sub-Recipe'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">
                    {(line.quantity_grams || line.sub_qty_grams || 0).toLocaleString()}g
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {line.ingredient_id && line.ingredients
                      ? `$${(((line.quantity_grams || 0) / 1000) * line.ingredients.unit_cost).toFixed(2)}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteLine(line.id)}
                      disabled={deleting === line.id}
                      className="text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-800">Total</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                  {totalWeight.toLocaleString()}g
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  ${totalCost.toFixed(2)}
                </td>
                <td></td>
              </tr><tr>
                <td colSpan={2} className="px-4 py-3 font-semibold text-indigo-600">
                  Cost per kg
                </td>
                <td className="px-4 py-3 text-right font-semibold text-indigo-600 text-base">
                  ${costPerKg.toFixed(2)}/kg
                </td><td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add Line Form */}
      <form onSubmit={addLine} className="bg-white border border-indigo-200 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Add Ingredient or Sub-Recipe</h2>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={newLine.type === 'ingredient'}
              onChange={() => setNewLine({ ...newLine, type: 'ingredient' })}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Ingredient</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={newLine.type === 'sub_recipe'}
              onChange={() => setNewLine({ ...newLine, type: 'sub_recipe' })}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Sub-Recipe</span>
          </label>
        </div><div className="grid grid-cols-2 gap-4">
          {newLine.type === 'ingredient' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ingredient</label>
              <select
                value={newLine.ingredient_id}
                onChange={(e) => setNewLine({ ...newLine, ingredient_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"required
              >
                <option value="">— Select ingredient —</option>
                {allIngredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sub-Recipe</label>
              <select
                value={newLine.sub_recipe_id}
                onChange={(e) => setNewLine({ ...newLine, sub_recipe_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">— Select recipe —</option>
                {allRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.products?.name || 'Base Recipe'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (grams)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={newLine.quantity_grams}
              onChange={(e) => setNewLine({ ...newLine, quantity_grams: e.target.value })}
              placeholder="e.g. 25000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={adding}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {adding ? 'Adding...' : 'Add Line'}
        </button>
      </form>

      {/* Product Weight Info */}
      {recipe.products?.weight_grams && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>Product weight:</strong> {recipe.products.weight_grams}g
          </p>
          <p className="text-sm text-blue-700 mt-1">
            <strong>Ingredient cost per unit:</strong> $
            {((recipe.products.weight_grams / 1000) * costPerKg).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  )
}