'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Search, Truck, X, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  ingredient_count: number
}

const emptyForm = {
  name: '', contact_name: '', phone: '', email: '', address: '', notes: '',
}

export default function SuppliersView({ suppliers: initial }: { suppliers: Supplier[] }) {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>(initial)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Supplier | null>(null)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [message, setMessage]     = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_name || '').toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setMessage(null)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name:         s.name,
      contact_name: s.contact_name || '',
      phone:        s.phone        || '',
      email:        s.email        || '',
      address:      s.address      || '',
      notes:        s.notes        || '',
    })
    setShowForm(true)
    setMessage(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Supplier name is required' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      const method = editing ? 'PUT' : 'POST'
      const body   = editing ? { id: editing.id, ...form } : form

      const res  = await fetch('/api/admin/suppliers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to save')

      if (editing) {
        setSuppliers(prev => prev.map(s => s.id === data.id ? { ...data, ingredient_count: s.ingredient_count } : s))
      } else {
        setSuppliers(prev => [...prev, { ...data, ingredient_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)))
      }

      setMessage({ type: 'success', text: `${editing ? 'Updated' : 'Added'} ${data.name}` })
      cancelForm()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`Delete ${s.name}?\n\n${s.ingredient_count > 0 ? `⚠️ ${s.ingredient_count} ingredients use this supplier — delete will fail.` : 'This cannot be undone.'}`)) return

    setDeleting(s.id)
    try {
      const res  = await fetch(`/api/admin/suppliers?id=${s.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuppliers(prev => prev.filter(x => x.id !== s.id))
      setMessage({ type: 'success', text: `Deleted ${s.name}` })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleActive(s: Supplier) {
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, is_active: !s.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuppliers(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x))
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-green-700" />
            Suppliers
          </h1>
          <p className="text-gray-500 text-sm mt-1">{suppliers.length} suppliers</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ backgroundColor: '#006A4E' }}
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search suppliers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
        />
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-6 p-5 bg-white rounded-lg shadow border">
          <h3 className="font-semibold mb-4">{editing ? 'Edit' : 'Add'} Supplier</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={e => setForm({ ...form, contact_name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#006A4E' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? 'Update' : 'Add'} Supplier
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Suppliers Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ingredients</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {search ? 'No suppliers match your search' : 'No suppliers yet — add one above'}
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id} className={`hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.contact_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.ingredient_count > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.ingredient_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleActive(s)} title={s.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                      {s.is_active
                        ? <ToggleRight className="h-5 w-5 text-green-600 mx-auto" />
                        : <ToggleLeft  className="h-5 w-5 text-gray-400 mx-auto" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        disabled={deleting === s.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}