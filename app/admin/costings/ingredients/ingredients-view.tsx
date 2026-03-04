'use client'

import { useState } from 'react'

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
}

interface Props {
  ingredients: Ingredient[]
}

const UNITS = ['kg', 'g', 'L', 'mL', 'each', 'dozen', 'tray']

const emptyForm = { name: '', unit: 'kg', unit_cost: '' }

export default function IngredientsView({ ingredients: initial }: Props) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setMessage(null)
  }

  function openEdit(ing: Ingredient) {
    setEditing(ing)
    setForm({ name: ing.name, unit: ing.unit, unit_cost: String(ing.unit_cost) })
    setShowForm(true)
    setMessage(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
    setMessage(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const payload = {
      id: editing?.id,
      name: form.name.trim(),
      unit: form.unit,
      unit_cost: parseFloat(form.unit_cost),
      previous_cost: editing?.unit_cost ?? null,
    }

    const res = await fetch('/api/admin/ingredients', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: json.error ?? 'Failed to save ingredient' })
      return
    }

    if (editing) {
      setIngredients((prev) =>
        prev.map((i) => (i.id === editing.id ? json.ingredient : i))
      )
      setMessage({ type: 'success', text: 'Ingredient updated' })
    } else {
      setIngredients((prev) =>
        [...prev, json.ingredient].sort((a, b) => a.name.localeCompare(b.name))
      )
      setMessage({ type: 'success', text: 'Ingredient added' })
    }

    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  async function handleDelete(ing: Ingredient) {
    if (!confirm(`Delete "${ing.name}"? This cannot be undone.`)) return
    setDeleting(ing.id)

    const res = await fetch('/api/admin/ingredients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ing.id }),
    })

    const json = await res.json()
    setDeleting(null)

    if (!res.ok) {
      setMessage({ type: 'error', text: json.error ?? 'Failed to delete ingredient' })
      return
    }

    setIngredients((prev) => prev.filter((i) => i.id !== ing.id))
    setMessage({ type: 'success', text: `"${ing.name}" deleted` })
  }

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingredients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''} — costs stored per kg
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
        >
          + Add Ingredient
        </button>
      </div>

      {/* Message */}
      {message && !showForm && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white border border-indigo-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            {editing ? `Edit — ${editing.name}` : 'Add New Ingredient'}
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* Name */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Plain Flour"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                  autoFocus
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Unit
                </label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Cost */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cost per {form.unit} ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Edit warning */}
            {editing && parseFloat(form.unit_cost) !== editing.unit_cost && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Price change: <strong>${editing.unit_cost.toFixed(4)}</strong> to{' '}
                <strong>${parseFloat(form.unit_cost || '0').toFixed(4)}</strong> — previous price will be saved to history.
              </div>
            )}

            {/* Form message */}
            {message && showForm && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  message.type === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
              >
                {saving ? 'Saving...' : editing ? 'Update Ingredient' : 'Add Ingredient'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium px-5 py-2.5 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ingredients..."
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? 'No ingredients match your search.' : 'No ingredients yet — add one above.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Unit</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Cost per Unit</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((ing) => (
                <tr key={ing.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{ing.name}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.unit}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    ${Number(ing.unit_cost).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(ing)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs px-3 py-1.5 rounded-md hover:bg-indigo-50 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(ing)}
                        disabled={deleting === ing.id}
                        className="text-red-500 hover:text-red-700 font-medium text-xs px-3 py-1.5 rounded-md hover:bg-red-50 transition disabled:opacity-40"
                      >
                        {deleting === ing.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Price changes are automatically logged to ingredient price history.
      </p>
    </div>
  )
}