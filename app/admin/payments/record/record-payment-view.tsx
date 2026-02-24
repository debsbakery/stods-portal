'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, DollarSign, Search } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash', label: '💵 Cash' },
  { value: 'check', label: '📝 Check' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'card', label: '💳 Card' },
  { value: 'eft', label: '🔄 EFT' },
];

export default function RecordPaymentView({ customers }: any) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    customer_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCustomers = customers.filter((c: any) =>
    (c.business_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (c.contact_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const selectedCustomer = customers.find((c: any) => c.id === formData.customer_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.customer_id || !formData.amount || parseFloat(formData.amount) <= 0) {
      setError('⚠️ Please select a customer and enter a valid amount');
      return;
    }

    // ✅ Prevent double-submit
    if (saving) return;
    
    setSaving(true);

    try {
      const response = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ Payment Recorded Successfully!\n\nCustomer: ${data.payment.customer}\nAmount: $${data.payment.amount.toFixed(2)}\nNew Balance: $${data.payment.new_balance.toFixed(2)}`);
        router.push('/admin/ar');
      } else {
        setError(data.error || 'Failed to record payment');
      }
    } catch (error) {
      setError('❌ Error recording payment. Please try again.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  const newBalance = selectedCustomer 
    ? selectedCustomer.balance - (parseFloat(formData.amount) || 0)
    : 0;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-green-600" />
          Record Payment
        </h1>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>

            <select
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a customer</option>
              {filteredCustomers.map((customer: any) => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name || customer.contact_name} - Balance: $
                  {customer.balance.toFixed(2)}
                </option>
              ))}
            </select>

            {selectedCustomer && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">Current Balance</p>
                  <p className="text-xl font-bold text-blue-800">
                    ${selectedCustomer.balance.toFixed(2)}
                  </p>
                </div>
                {formData.amount && (
                  <div className="p-3 bg-green-50 rounded border border-green-200">
                    <p className="text-xs text-green-600 mb-1">New Balance</p>
                    <p className="text-xl font-bold text-green-800">
                      ${newBalance.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Date *
            </label>
            <input
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method *
            </label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference Number
            </label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="Check #, Transaction ID, etc. (Optional)"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes about this payment"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Recording Payment...' : 'Record Payment'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/ar')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}