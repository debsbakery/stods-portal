'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, DollarSign, Search, FileText, CheckCircle, MinusCircle } from 'lucide-react';

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
  status:         string | null;
}

interface Credit {
  id:          string;
  customer_id: string;
  amount:      number;
  amount_paid: number | null;
  description: string | null;
  created_at:  string;
}

interface Allocation {
  invoice_id: string;
  amount:     number;
  is_credit?: boolean;
}

interface RecordPaymentWithAllocationProps {
  customers: Customer[];
  invoices:  Invoice[];
  credits:   Credit[];
}

export default function RecordPaymentWithAllocation({
  customers = [],
  invoices  = [],
  credits   = [],
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

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);

  // ── Filtering ─────────────────────────────────────────────────────────────
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

  const customerCredits = Array.isArray(credits)
    ? credits.filter((c) => c?.customer_id === formData.customer_id)
    : [];

  // ── Calculations ──────────────────────────────────────────────────────────
  const currentBalance = (selectedCustomer && typeof selectedCustomer.balance === 'number')
    ? selectedCustomer.balance
    : 0;

  const paymentAmount = parseFloat(formData.amount) || 0;

  const unallocatedAmount = paymentAmount - allocations
    .filter(a => !a.is_credit)
    .reduce((sum, a) => sum + (parseFloat(String(a?.amount)) || 0), 0);

  const totalOutstanding = customerInvoices.reduce((sum, inv) => {
    const total = parseFloat(String(inv?.total_amount)) || 0;
    const paid  = parseFloat(String(inv?.amount_paid))  || 0;
    return sum + Math.max(0, total - paid);
  }, 0);

  // ── Auto allocate ─────────────────────────────────────────────────────────
  function handleAutoAllocate() {
    if (paymentAmount <= 0) return;

    const newAllocations: Allocation[] = [];
    let remaining = paymentAmount;

    const sortedCredits = [...customerCredits].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const credit of sortedCredits) {
      const creditAmt = Number(credit.amount) || 0;
      newAllocations.push({ invoice_id: credit.id, amount: -creditAmt, is_credit: true });
      remaining -= creditAmt;
    }

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

  // ── Manual allocate invoice ───────────────────────────────────────────────
  function handleManualAllocate(invoiceId: string, amount: number) {
    if (!invoiceId || !Array.isArray(customerInvoices)) return;

    const invoice = customerInvoices.find((i) => i?.id === invoiceId);
    if (!invoice) return;

    const total        = parseFloat(String(invoice.total_amount)) || 0;
    const paid         = parseFloat(String(invoice.amount_paid))  || 0;
    const due          = total - paid;
    const current      = allocations.find(a => a?.invoice_id === invoiceId && !a.is_credit)?.amount || 0;
    const invoiceAlloc = allocations.filter(a => !a.is_credit).reduce((s, a) => s + a.amount, 0);
    const maxAllowable = paymentAmount - invoiceAlloc + current;
    const validAmount  = Math.max(0, Math.min(amount, due, maxAllowable));

    setAllocations((prev) => {
      const existing = prev.find((a) => a?.invoice_id === invoiceId && !a.is_credit);
      if (existing) {
        if (validAmount === 0) return prev.filter((a) => !(a?.invoice_id === invoiceId && !a.is_credit));
        return prev.map((a) =>
          a?.invoice_id === invoiceId && !a.is_credit
            ? { invoice_id: invoiceId, amount: validAmount }
            : a
        );
      } else if (validAmount > 0) {
        return [...prev, { invoice_id: invoiceId, amount: validAmount }];
      }
      return prev;
    });
  }

  // ── Toggle credit ─────────────────────────────────────────────────────────
  function handleToggleCredit(credit: Credit) {
    const creditAmt  = Number(credit.amount) || 0;
    const isIncluded = allocations.some(a => a.invoice_id === credit.id && a.is_credit);
    if (isIncluded) {
      setAllocations(prev => prev.filter(a => !(a.invoice_id === credit.id && a.is_credit)));
    } else {
      setAllocations(prev => [...prev, { invoice_id: credit.id, amount: -creditAmt, is_credit: true }]);
    }
  }

  // ── Tick invoice toggle ───────────────────────────────────────────────────
  function handleTickInvoice(invoice: Invoice) {
    const total     = parseFloat(String(invoice.total_amount)) || 0;
    const paid      = parseFloat(String(invoice.amount_paid))  || 0;
    const due       = total - paid;
    const allocated = allocations.find(a => a.invoice_id === invoice.id && !a.is_credit)?.amount || 0;

    if (allocated > 0) {
      handleManualAllocate(invoice.id, 0);
    } else {
      handleManualAllocate(invoice.id, due);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.customer_id || !formData.amount || parseFloat(formData.amount) === 0) {
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
        const customerName  = data?.payment?.customer                        || 'Customer';
        const amount        = parseFloat(String(data?.payment?.amount))      || 0;
        const newBalance    = parseFloat(String(data?.payment?.new_balance)) || 0;
        const invoiceAllocs = allocations.filter(a => !a.is_credit);
        const creditAllocs  = allocations.filter(a =>  a.is_credit);
        const allocatedMsg  = invoiceAllocs.length > 0
          ? ` | Allocated to ${invoiceAllocs.length} invoice(s)`
          : '';
        const creditMsg = creditAllocs.length > 0
          ? ` | ${creditAllocs.length} credit(s) applied`
          : '';
        const overpaymentMsg = data?.payment?.overpayment > 0
          ? ` | ⚠️ $${parseFloat(data.payment.overpayment).toFixed(2)} overpayment credit created`
          : '';

        setSuccess(
          `✅ Payment recorded for ${customerName} — $${amount.toFixed(2)}${allocatedMsg}${creditMsg}${overpaymentMsg} | New balance: $${newBalance.toFixed(2)}`
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

  const hasAllocation = customerInvoices.length > 0 || customerCredits.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* Success banner */}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
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

            {/* ── Balance / Payment / New Balance stats ── */}
            {selectedCustomer && (
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">Current Balance</p>
                  <p className="text-xl font-bold text-blue-800">${currentBalance.toFixed(2)}</p>
                </div>
                {formData.amount && paymentAmount !== 0 && (
                  <>
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <p className="text-xs text-purple-600 mb-1">
                        {paymentAmount < 0 ? 'Reversal Amount' : 'Cash Payment'}
                      </p>
                      <p className="text-xl font-bold text-purple-800">
                        ${Math.abs(paymentAmount).toFixed(2)}
                      </p>
                    </div>
                    {(() => {
                      const creditOffset    = Math.abs(
                        allocations.filter(a => a.is_credit).reduce((s, a) => s + a.amount, 0)
                      );
                      const projectedBalance = currentBalance - paymentAmount - creditOffset;
                      const isReversal       = paymentAmount < 0;
                      return (
                        <div className={`p-3 rounded border ${
                          isReversal ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                        }`}>
                          <p className={`text-xs mb-1 ${isReversal ? 'text-red-600' : 'text-green-600'}`}>
                            {isReversal ? 'Balance After Reversal' : 'New Balance'}
                          </p>
                          <p className={`text-xl font-bold ${isReversal ? 'text-red-800' : 'text-green-800'}`}>
                            ${projectedBalance.toFixed(2)}
                          </p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Payment Amount ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount Received{' '}
              <span className="text-gray-400 font-normal">(use negative to reverse a payment)</span> *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => {
                  setFormData({ ...formData, amount: e.target.value });
                  setAllocations([]);
                }}
                required
                placeholder="0.00"
                className={`w-full pl-8 pr-4 py-3 text-lg border rounded-md focus:ring-2 focus:ring-green-500 ${
                  paymentAmount < 0
                    ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400'
                    : 'border-gray-300'
                }`}
              />
            </div>
            {paymentAmount < 0 && (
              <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800 flex items-start gap-2">
                <span className="text-base leading-none">↩️</span>
                <div>
                  <p className="font-semibold">Payment Reversal</p>
                  <p className="mt-0.5">
                    This will <strong>add ${Math.abs(paymentAmount).toFixed(2)}</strong> back
                    to the customer's balance. Use this to reverse a payment entered in error.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Invoice & Credit Allocation (hidden for reversals) ── */}
          {formData.customer_id && hasAllocation && paymentAmount > 0 && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Allocate to Invoices &amp; Credits
                </h3>
                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Auto-Allocate (Oldest First)
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">

                {/* Credits */}
                {customerCredits.length > 0 && (
                  <div className="mb-1">
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <MinusCircle className="h-3 w-3" /> Credit Notes — tick to apply
                    </p>
                    {customerCredits.map((credit) => {
                      const creditAmt  = Number(credit.amount) || 0;
                      const isIncluded = allocations.some(a => a.invoice_id === credit.id && a.is_credit);
                      return (
                        <div
                          key={credit.id}
                          className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors mb-1 ${
                            isIncluded
                              ? 'bg-orange-50 border-orange-300'
                              : 'bg-white hover:bg-orange-50 border-orange-200'
                          }`}
                          onClick={() => handleToggleCredit(credit)}
                        >
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => {}}
                            className="w-5 h-5 accent-orange-500 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-orange-700">
                              {credit.description || 'Credit Note'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(credit.created_at).toLocaleDateString('en-AU')}
                              {' • '}
                              <span className="text-orange-600 font-medium">
                                Reduces balance by ${creditAmt.toFixed(2)}
                              </span>
                            </p>
                          </div>
                          <span className="text-orange-600 font-bold text-sm whitespace-nowrap">
                            -${creditAmt.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Invoices */}
                {customerInvoices.length > 0 && (
                  <div>
                    {customerCredits.length > 0 && (
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Invoices
                      </p>
                    )}
                    {customerInvoices.map((invoice) => {
                      const total     = parseFloat(String(invoice?.total_amount)) || 0;
                      const paid      = parseFloat(String(invoice?.amount_paid))  || 0;
                      const due       = total - paid;
                      const allocated = allocations.find(
                        (a) => a?.invoice_id === invoice.id && !a.is_credit
                      )?.amount || 0;
                      const isTicked  = allocated > 0;

                      if (due <= 0)                      return null;
                      if (invoice.status === 'cancelled') return null;
                      if (invoice.invoice_number == null) return null;

                      return (
                        <div
                          key={invoice.id}
                          className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors mb-1 ${
                            isTicked
                              ? 'bg-green-50 border-green-300'
                              : 'bg-white hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => handleTickInvoice(invoice)}
                        >
                          <input
                            type="checkbox"
                            checked={isTicked}
                            onChange={() => {}}
                            className="w-5 h-5 accent-green-600 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold text-gray-800">
                              Invoice #{String(invoice.invoice_number).padStart(6, '0')}
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
                          <div className="w-32" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                          <input
  type="number"
  step="0.01"
  min="-999999"
  value={formData.amount}
  onChange={(e) => {
    setFormData({ ...formData, amount: e.target.value });
    setAllocations([]);
  }}
  required
  placeholder="0.00"
  className={`w-full pl-8 pr-4 py-3 text-lg border rounded-md focus:ring-2 focus:ring-green-500 ${
    paymentAmount < 0
      ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400'
      : 'border-gray-300'
  }`}
/>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unallocated + overpayment warnings */}
              {unallocatedAmount > 0.01 && (
                <div className="mt-3 space-y-2">
                  <div className="p-2 rounded text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
                    💡 Unallocated: ${unallocatedAmount.toFixed(2)} (will reduce overall balance)
                  </div>
                  {paymentAmount > totalOutstanding + 0.01 && (
                    <div className="p-3 rounded text-sm bg-amber-50 border border-amber-400 text-amber-900 flex items-start gap-2">
                      <span className="text-lg leading-none">⚠️</span>
                      <div>
                        <p className="font-semibold">Overpayment detected</p>
                        <p className="mt-0.5">
                          Payment of <strong>${paymentAmount.toFixed(2)}</strong> exceeds all
                          outstanding invoices. A credit of{' '}
                          <strong>${(paymentAmount - totalOutstanding).toFixed(2)}</strong>{' '}
                          will be automatically created on this account.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              {allocations.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1 text-xs text-gray-600">
                  {allocations.filter(a => a.is_credit).length > 0 && (
                    <p className="text-orange-600">
                      Credits applied: -${Math.abs(
                        allocations.filter(a => a.is_credit).reduce((s, a) => s + a.amount, 0)
                      ).toFixed(2)}
                    </p>
                  )}
                  {allocations.filter(a => !a.is_credit).length > 0 && (
                    <p className="text-green-600">
                      Cash allocated to invoices: ${
                        allocations.filter(a => !a.is_credit).reduce((s, a) => s + a.amount, 0).toFixed(2)
                      }
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Payment Date ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Reference Number</label>
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