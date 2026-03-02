'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShoppingCart, Trash2 } from 'lucide-react';
import type { Product } from '@/lib/types';

export default function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('code', { ascending: true, nullsFirst: false }); // ✅ Changed from product_number

    if (error) {
      console.error('Error loading products:', error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  async function saveProduct(product: Partial<Product>) {
    // ✅ Validate code field instead (optional validation)
    if (product.code && product.code.trim()) {
      // Check if code is already used
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('code', product.code.trim())
        .neq('id', product.id || '');

      if (existing && existing.length > 0) {
        alert(`Product code ${product.code} is already in use`);
        return;
      }
    }
async function deleteProduct(product: Product) {
  if (!confirm(`Delete "${product.name}"?\n\nThis cannot be undone.`)) return

  const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
  const result = await res.json()

  if (result.success) {
    loadProducts()
  } else {
    alert('Failed to delete product')
  }
}
    const { error } = await supabase
      .from('products')
      .update({
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        code: product.code, // ✅ Changed from product_number
        unit: product.unit,
      })
      .eq('id', product.id!);

    if (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    } else {
      setIsEditing(null);
      loadProducts();
    }
  }

  if (loading) {
    return <div className="p-8">Loading products...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="h-6 w-6 text-green-600" />
        <h2 className="text-2xl font-bold">Product Management</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id}>
                {isEditing === product.id ? (
                  <>
                    {/* ✅ CODE FIELD (was wrong) */}
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={editForm.code || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, code: e.target.value || null })
                        }
                        className="w-24 border border-gray-300 rounded px-2 py-1 font-mono"
                        placeholder="1001"
                      />
                    </td>

                    {/* NAME */}
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1"
                      />
                    </td>

                    {/* ✅ CATEGORY FIELD (was showing code) */}
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={editForm.category || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, category: e.target.value || null })
                        }
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        placeholder="Bread, Cake, etc."
                      />
                    </td>

                    {/* UNIT */}
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={editForm.unit || ''}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        className="w-20 border border-gray-300 rounded px-2 py-1"
                        placeholder="ea, kg"
                      />
                    </td>

                    {/* PRICE */}
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.price || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, price: parseFloat(e.target.value) })
                        }
                        className="w-24 border border-gray-300 rounded px-2 py-1"
                      />
                    </td>

                    {/* ACTIONS */}
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => saveProduct(editForm)}
                        className="text-green-600 hover:text-green-900 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditing(null)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </td>
                    {/* ACTIONS */}
<td className="px-6 py-4 whitespace-nowrap text-right space-x-3">
  <button
    onClick={() => {
      setIsEditing(product.id);
      setEditForm(product);
    }}
    className="text-[#006A4E] hover:text-[#004d38] font-medium"
  >
    Edit
  </button>
  <button
    onClick={() => deleteProduct(product)}
    className="text-red-500 hover:text-red-700"
    title="Delete product"
  >
    <Trash2 className="h-4 w-4 inline" />
  </button>
</td>
                  </>
                ) : (
                  <>
                    {/* ✅ DISPLAY CODE (was product_number) */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-semibold text-gray-900">
                        {product.code || '—'}
                      </span>
                    </td>

                    {/* NAME */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                    </td>

                    {/* CATEGORY */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">{product.category || '—'}</span>
                    </td>

                    {/* UNIT */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">{product.unit}</span>
                    </td>

                    {/* PRICE */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        ${product.price.toFixed(2)}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => {
                          setIsEditing(product.id);
                          setEditForm(product);
                        }}
                        className="text-[#006A4E] hover:text-[#004d38] font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}