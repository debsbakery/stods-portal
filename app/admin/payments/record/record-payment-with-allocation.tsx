'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, DollarSign, Search, FileText, CheckCircle } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'check',         label: '📝 Check' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'card',          label: '💳 Card' },
  { value: 'eft',           label: '🔄 EFT' },
];

interface Customer {
  id: string;
  business_name: string | null;
  contact_name:  string | null;
  balance:       number | null;
}

interface Invoice {
  id:             string;
  delivery_date:  string;
  total_amount:   number;
  amount_paid:    number | null;
  customer_id:    string;
  invoice_number: number | null;
}

interface RecordPaymentWithAllocationProps {
  customers: Customer[];
  invoices:  Invoice[];
}

export default function RecordPaymentWithAllocation({ 
  customers = [], 
  invoices  = [],
}: RecordPaymentWithAllocationProps) {
  const router = useRouter();

  const [formData, setFormData] = useState({
    customer_id:      '',
    amount:           '',
    payment_date:     new Date().toISOString().split('T')[0],
    payment_method:   'bank_transfer',
    reference_number: '',
    notes:            '',
  });

  const [allocations, setAllocations] = useState<{ invoice_id: string; amount: number }[]>([]);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);  // ✅ NEW

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredCustomers = Array.isArray(customers)
    ? customers.filter((c) => {
        if (!c || typeof c !== 'object') return false;
        const q = String(searchTerm || '').toLowerCase();
        return (
          String(c.business_name || '').toLowerCase().includes(q) ||
          String(c.contact_name  || '').toLowerCase().includes(q)
        );
      })
    : [];

  const selectedCustomer = Array.isArray(customers)
    ? customers.find((c) => c?.id === formData.customer_id)
    : null;

  const customerInvoices = Array.isArray(invoices)
    ? invoices.filter((inv) => inv?.customer_id === formData.customer_id)
    : [];

  // ── Calculations ───────────────────────────────────────────────────────────
  const currentBalance = (selectedCustomer && typeof selectedCustomer.balance === 'number')
    ? selectedCustomer.balance
    : 0;

  const paymentAmount = parseFloat(formData.amount) || 0;

  const allocatedAmount = Array.isArray(allocations)
    ? allocations.reduce((sum, a) => sum + (parseFloat(String(a?.amount)) || 0), 0)
    : 0;

  const unallocatedAmount = paymentAmount - allocatedAmount;

  // ── Auto allocate ──────────────────────────────────────────────────────────
  function handleAutoAllocate() {
    if (paymentAmount <= 0 || !Array.isArray(customerInvoices)) return;

    const newAllocations: { invoice_id: string; amount: number }[] = [];
    let remaining = paymentAmount;

    const sorted = [...customerInvoices].sort(
      (a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime()
    );

    for (const invoice of sorted) {
      if (remaining <= 0) break;
      const total    = parseFloat(String(invoice?.total_amount)) || 0;
      const paid     = parseFloat(String(invoice?.amount_paid))  || 0;
      const due      = total - paid;
      const allocate = Math.min(remaining, due);
      if (allocate > 0 && invoice?.id) {
        newAllocations.push({ invoice_id: invoice.id, amount: allocate });
        remaining -= allocate;
      }
    }
    setAllocations(newAllocations);
  }

  // ── Manual allocate ────────────────────────────────────────────────────────
  function handleManualAllocate(invoiceId: string, amount: number) {
    if (!invoiceId || !Array.isArray(customerInvoices)) return;

    const invoice = customerInvoices.find((i) => i?.id === invoiceId);
    if (!invoice) return;

    const total    = parseFloat(String(invoice.total_amount)) || 0;
    const paid     = parseFloat(String(invoice.amount_paid))  || 0;
    const due      = total - paid;
    const current  = Array.isArray(allocations)
      ? allocations.find(a => a?.invoice_id === invoiceId)?.amount || 0
      : 0;
    const maxAllowable = paymentAmount - allocatedAmount + current;
    const validAmount  = Math.max(0, Math.min(amount, due, maxAllowable));

    setAllocations((prev) => {
      if (!Array.isArray(prev)) return [];
      const existing = prev.find((a) => a?.invoice_id === invoiceId);
      if (existing) {
        if (validAmount === 0) return prev.filter((a) => a?.invoice_id !== invoiceId);
        return prev.map((a) =>
          a?.invoice_id === invoiceId ? { invoice_id: invoiceId, amount: validAmount } : a
        );
      } else if (validAmount > 0) {
        return [...prev, { invoice_id: invoiceId, amount: validAmount }];
      }
      return prev;
    });
  }

  // ── Tick box toggle ────────────────────────────────────────────────────────
  function handleTickInvoice(invoice: Invoice) {
    const total     = parseFloat(String(invoice.total_amount)) || 0;
    const paid      = parseFloat(String(invoice.amount_paid))  || 0;
    const due       = total - paid;
    const allocated = allocations.find(a => a.invoice_id === invoice.id)?.amount || 0;

    if (allocated > 0) {
      // ✅ Untick — remove allocation
      handleManualAllocate(invoice.id, 0);
    } else {
      // ✅ Tick — auto fill the due amount
      handleManualAllocate(invoice.id, due);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.customer_id || !formData.amount || parseFloat(formData.amount) <= 0) {
      setError('⚠️ Please select a customer and enter a valid amount');
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      const response = await fetch('/api/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount:      parseFloat(formData.amount),
          allocations: Array.isArray(allocations) ? allocations : [],
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const customerName = data?.payment?.customer    || 'Customer';
        const amount       = parseFloat(String(data?.payment?.amount))      || 0;
        const newBalance   = parseFloat(String(data?.payment?.new_balance)) || 0;
        const allocatedMsg = allocations.length > 0
          ? ` | Allocated to ${allocations.length} invoice(s): $${allocatedAmount.toFixed(2)}`
          : '';

        // ✅ Stay on page — show success banner, reset form
        setSuccess(
          `✅ Payment recorded for ${customerName} — $${amount.toFixed(2)}${allocatedMsg} | New balance: $${newBalance.toFixed(2)}`
        );

        setFormData({
          customer_id:      '',
          amount:           '',
          payment_date:     new Date().toISOString().split('T')[0],
          payment_method:   'bank_transfer',
          reference_number: '',
          notes:            '',
        });
        setAllocations([]);
        setSearchTerm('');

      } else {
        setError(data?.error || 'Failed to record payment');
      }
    } catch (err) {
      setError('❌ Error recording payment');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin/ar')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to AR
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-green-600" />
          Record Payment
        </h1>

        {/* ✅ Success banner */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex justify-between items-center">
            <span className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              {success}
            </span>
            <button
              onClick={() => setSuccess(null)}
              className="text-green-600 hover:text-green-800 font-bold ml-4 text-lg"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Customer Selection ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
              onChange={(e) => {
                setFormData({ ...formData, customer_id: e.target.value });
                setAllocations([]);
              }}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a customer</option>
              {filteredCustomers.map((customer) => {
                const balance = typeof customer.balance === 'number' ? customer.balance : 0;
                const name    = customer?.business_name || customer?.contact_name || 'Unknown';
                return (
                  <option key={customer.id} value={customer.id}>
                    {name} — Balance: ${balance.toFixed(2)}
                  </option>
                );
              })}
            </select>

            {selectedCustomer && (
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">Current Balance</p>
                  <p className="text-xl font-bold text-blue-800">
                    ${currentBalance.toFixed(2)}
                  </p>
                </div>
                {formData.amount && paymentAmount > 0 && (
                  <>
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <p className="text-xs text-purple-600 mb-1">Allocated to Invoices</p>
                      <p className="text-xl font-bold text-purple-800">
                        ${allocatedAmount.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded border border-green-200">
                      <p className="text-xs text-green-600 mb-1">New Balance</p>
                      <p className="text-xl font-bold text-green-800">
                        ${(currentBalance - paymentAmount).toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Payment Amount ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => {
                  setFormData({ ...formData, amount: e.target.value });
                  setAllocations([]);
                }}
                required
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* ── Invoice Allocation ── */}
          {formData.customer_id && customerInvoices.length > 0 && paymentAmount > 0 && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Allocate to Invoices (Optional)
                </h3>
                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Auto-Allocate (Oldest First)
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {customerInvoices.map((invoice) => {
                  const total     = parseFloat(String(invoice?.total_amount)) || 0;
                  const paid      = parseFloat(String(invoice?.amount_paid))  || 0;
                  const due       = total - paid;
                  const allocated = allocations.find((a) => a?.invoice_id === invoice.id)?.amount || 0;
                  const isTicked  = allocated > 0;

                  if (due <= 0) return null; // ✅ Hide fully paid invoices

                  return (
                    <div
                      key={invoice.id}
                      className={[
                        'flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors',
                        isTicked ? 'bg-green-50 border-green-300' : 'bg-white hover:bg-gray-50 border-gray-200',
                      ].join(' ')}
                      onClick={() => handleTickInvoice(invoice)}
                    >
                      {/* ✅ Tick box */}
                      <input
                        type="checkbox"
                        checked={isTicked}
                        onChange={() => {}}
                        className="w-5 h-5 accent-green-600 shrink-0 cursor-pointer"
                      />

                      {/* Invoice details */}
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-gray-800">
                          Invoice #{invoice.invoice_number != null
                            ? String(invoice.invoice_number).padStart(6, '0')
                            : 'PENDING'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(invoice.delivery_date + 'T00:00:00').toLocaleDateString('en-AU')}
                          {' • '}Total: ${total.toFixed(2)}
                          {' • '}
                          <span className={due > 0 ? 'text-red-600 font-medium' : ''}>
                            Due: ${due.toFixed(2)}
                          </span>
                        </p>
                      </div>

                      {/* Amount input */}
                      <div className="w-32" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={due}
                            value={allocated || ''}
                            onChange={(e) =>
                              handleManualAllocate(invoice.id, parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                            className="w-full pl-5 pr-2 py-1 text-sm border rounded focus:outline-none focus:border-green-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {unallocatedAmount > 0.01 && (
                <div className="mt-3 p-2 rounded text-sm bg-yellow-50 text-yellow-800">
                  💡 Unallocated: ${unallocatedAmount.toFixed(2)} (will reduce overall balance)
                </div>
              )}
            </div>
          )}

          {/* ── Payment Date ── */}
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

          {/* ── Payment Method ── */}
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

          {/* ── Reference Number ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference Number
            </label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="Check #, Transaction ID, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* ── Buttons ── */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/ar')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to AR
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}