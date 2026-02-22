'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Star, Plus, Minus, ShoppingCart, Trash2 } from 'lucide-react';

export default function ShadowOrderView({ customer, shadowOrders }: any) {
  const router = useRouter();
  const [items, setItems] = useState(shadowOrders || []);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    shadowOrders?.forEach((item: any) => {
      initial[item.id] = item.default_quantity;
    });
    return initial;
  });
  const [placing, setPlacing] = useState(false);

  function updateQuantity(itemId: string, newQuantity: number) {
    setQuantities({
      ...quantities,
      [itemId]: Math.max(0, newQuantity),
    });
  }

  function calculateTotal() {
    return items.reduce((sum: number, item: any) => {
      const qty = quantities[item.id] || 0;
      const price = item.product?.price || 0;
      return sum + qty * price;
    }, 0);
  }

  async function placeOrder() {
    const selectedItems = items.filter((item: any) => (quantities[item.id] || 0) > 0);

    if (selectedItems.length === 0) {
      alert('⚠️ Please add at least one item');
      return;
    }

    setPlacing(true);

    try {
      const response = await fetch('/api/orders/shadow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: quantities[item.id],
          })),
        }),
      });

      if (response.ok) {
        const { order_id } = await response.json();
        alert('✅ Order placed successfully!');
        router.push('/portal');
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Error placing order');
      console.error(error);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => router.push('/portal')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Portal
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <Star className="h-8 w-8 text-yellow-500" />
          My Usual Items
        </h1>

        {items.length === 0 ? (
          <div className="text-center py-12">
            <Star className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium mb-2">
              No usual items saved yet
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Contact admin to add your frequently ordered items
            </p>
            <button
              onClick={() => router.push('/catalog')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Browse All Products
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {items.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.product?.name || 'Unknown Product'}</p>
                    <p className="text-sm text-gray-500">
                      #{item.product?.product_number || '—'} • $
                      {item.product?.price?.toFixed(2) || '0.00'} per {item.product?.unit || 'ea'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, (quantities[item.id] || 0) - 1)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-center font-semibold">
                      {quantities[item.id] || 0}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, (quantities[item.id] || 0) + 1)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="w-24 text-right font-semibold">
                    ${((quantities[item.id] || 0) * (item.product?.price || 0)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-2xl font-bold text-green-600">
                  ${calculateTotal().toFixed(2)}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={placeOrder}
                  disabled={placing || calculateTotal() === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {placing ? 'Placing Order...' : 'Place Order'}
                </button>
                <button
                  onClick={() => router.push('/portal')}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}