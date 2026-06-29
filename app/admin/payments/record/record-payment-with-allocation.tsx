'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, DollarSign, Search, FileText, CheckCircle, MinusCircle, AlertTriangle } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'check',         label: '📝 Check' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'card',          label: '💳 Card' },
  { value: 'eft',           label: '🔄 EFT' },
];

const money = (n: number | string | null | undefined): number => {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return Math.round((Number.isFinite(v as number) ? (v as number) : 0) * 100) / 100;
};

interface Customer {
  id: string;
  business_name: string | null;
  contact_name:  string | null;
  balance:       number | null;
}

interface Invoice {
  id: string;
  customer_id: string;
  delivery_date: string;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  invoice_number: number | null;
  is_weekly?: boolean;
}

interface Credit {
  id:              string;
  customer_id:     string;
  amount:          number;
  amount_paid:     number | null;
  description:     string | null;
  created_at:      string;
  invoice_number?: number | null;
}

interface Allocation {
  invoice_id:      string;
  amount:          number;
  is_credit?:      boolean;
  is_weekly?:      boolean;
  accept_as_full?: boolean;
  short_amount?:   number;
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
  const allocationPanelRef = useRef<HTMLDivElement>(null);

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

  // Unapplied credits — any credit with remaining balance not yet ticked
  const unappliedCredits = customerCredits.filter(c => {
    const remaining = money(money(c.amount) - money(c.amount_paid))
    const isTicked  = allocations.some(a => a.invoice_id === c.id && a.is_credit)
    return remaining > 0 && !isTicked
  })
  const unappliedTotal = money(unappliedCredits.reduce((s, c) => s + money(money(c.amount) - money(c.amount_paid)), 0))

  const currentBalance   = money(selectedCustomer?.balance);
  const cashAmount       = money(formData.amount);

  const tickedCredits    = allocations.filter(a => a.is_credit);
  const creditPoolAmount = money(tickedCredits.reduce((sum, a) => sum + Math.abs(money(a?.amount)), 0));
  const totalAvailable   = money(cashAmount + creditPoolAmount);
  const allocatedToInvoices = money(allocations.filter(a => !a.is_credit).reduce((sum, a) => sum + money(a?.amount), 0));
  const unallocatedAmount   = money(totalAvailable - allocatedToInvoices);

  const totalOutstanding = money(customerInvoices.reduce((sum, inv) => {
    if (inv?.status === 'cancelled')  return sum;
    if (inv?.invoice_number == null)  return sum;
    const total = money(inv?.total_amount);
    const paid  = money(inv?.amount_paid);
    return sum + Math.max(0, money(total - paid));
  }, 0));

  // Apply all unapplied credits + auto-allocate to invoices
  function handleApplyNow() {
    // Tick all unapplied credits
    const creditAllocs: Allocation[] = unappliedCredits.map(c => ({
      invoice_id: c.id,
      amount:     -money(money(c.amount) - money(c.amount_paid)),
      is_credit:  true,
    }))
    const creditPool = money(creditAllocs.reduce((s, a) => s + Math.abs(a.amount), 0))
    let remaining    = money(cashAmount + creditPool)

    const invoiceAllocs: Allocation[] = []
    const sortedInvoices = [...customerInvoices]
      .filter(inv => inv?.status !== 'cancelled' && inv?.invoice_number != null)
      .sort((a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime())

    for (const invoice of sortedInvoices) {
      if (remaining < 0.01) break
      const due      = money(money(invoice.total_amount) - money(invoice.amount_paid))
      if (due < 0.01) continue
      const allocate = money(Math.min(remaining, due))
      if (allocate > 0) {
        invoiceAllocs.push({ invoice_id: invoice.id, amount: allocate, is_weekly: invoice.is_weekly ?? false })
        remaining = money(remaining - allocate)
      }
    }

    setAllocations([...creditAllocs, ...invoiceAllocs])
    // Scroll to allocation panel
    setTimeout(() => allocationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function handleAutoAllocate() {
    const newAllocations: Allocation[] = [];
    const sortedCredits = [...customerCredits].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const credit of sortedCredits) {
      const remaining = money(money(credit.amount) - money(credit.amount_paid));
      if (remaining > 0) {
        newAllocations.push({ invoice_id: credit.id, amount: -remaining, is_credit: true });
      }
    }
    const creditPool = money(newAllocations.reduce((s, a) => s + Math.abs(a.amount), 0));
    let remaining    = money(cashAmount + creditPool);

    const sortedInvoices = [...customerInvoices]
      .filter(inv => inv?.status !== 'cancelled' && inv?.invoice_number != null)
      .sort((a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime());

    for (const invoice of sortedInvoices) {
      if (remaining < 0.01) break;
      const total    = money(invoice?.total_amount);
      const paid     = money(invoice?.amount_paid);
      const due      = money(total - paid);
      if (due < 0.01) continue;
      const allocate = money(Math.min(remaining, due));
      if (allocate > 0 && invoice?.id) {
        newAllocations.push({ invoice_id: invoice.id, amount: allocate, is_weekly: invoice.is_weekly ?? false });
        remaining = money(remaining - allocate);
      }
    }
    setAllocations(newAllocations);
  }

  function handleManualAllocate(invoiceId: string, amount: number) {
    if (!invoiceId || !Array.isArray(customerInvoices)) return;
    const invoice = customerInvoices.find((i) => i?.id === invoiceId);
    if (!invoice) return;
    const due         = money(money(invoice.total_amount) - money(invoice.amount_paid));
    const validAmount = money(Math.max(0, Math.min(amount, due)));
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
        return [...prev, { invoice_id: invoiceId, amount: validAmount, is_weekly: invoice.is_weekly ?? false }];
      }
      return prev;
    });
  }

  function handleToggleCredit(credit: Credit) {
    const remaining  = money(money(credit.amount) - money(credit.amount_paid));
    const isIncluded = allocations.some(a => a.invoice_id === credit.id && a.is_credit);
    if (isIncluded) {
      setAllocations(prev => prev.filter(a => !(a.invoice_id === credit.id && a.is_credit)));
    } else if (remaining > 0) {
      setAllocations(prev => [...prev, { invoice_id: credit.id, amount: -remaining, is_credit: true }]);
    }
  }

  function handleTickInvoice(invoice: Invoice) {
    const due       = money(money(invoice.total_amount) - money(invoice.amount_paid));
    const allocated = money(allocations.find(a => a.invoice_id === invoice.id && !a.is_credit)?.amount || 0);
    if (allocated > 0) {
      handleManualAllocate(invoice.id, 0);
    } else {
      const currentlyAllocated = money(allocations.filter(a => !a.is_credit).reduce((sum, a) => sum + money(a.amount), 0));
      const remaining          = money(totalAvailable - currentlyAllocated);
      handleManualAllocate(invoice.id, money(Math.min(due, Math.max(0, remaining))));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.customer_id) { setError('⚠️ Please select a customer'); return; }
    if (cashAmount === 0 && tickedCredits.length === 0) {
      setError('⚠️ Enter a cash amount or tick at least one credit to apply'); return;
    }
    if (cashAmount === 0 && allocatedToInvoices === 0 && tickedCredits.length > 0) {
      setError('⚠️ Tick credit(s) AND allocate them to invoice(s)'); return;
    }
    if (saving) return;
    setSaving(true);

    try {
      const cleanAllocations = (Array.isArray(allocations) ? allocations : []).map(a => ({
        ...a,
        amount: a.is_credit ? -money(Math.abs(a.amount)) : money(a.amount),
      }));

      const response = await fetch('/api/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: cashAmount, allocations: cleanAllocations }),
      });

      const data = await response.json();

      if (response.ok) {
        const customerName   = data?.payment?.customer || 'Customer';
        const cash           = money(data?.payment?.amount);
        const newBalance     = money(data?.payment?.new_balance);
        const creditUsed     = money(data?.payment?.credit_used);
        const allocatedMsg   = (data?.payment?.allocations || 0) > 0 ? ` | Allocated to ${data.payment.allocations} invoice(s)` : '';
        const creditMsg      = creditUsed > 0 ? ` | $${creditUsed.toFixed(2)} credit applied` : '';
        const overpaymentMsg = data?.payment?.overpayment > 0 ? ` | ⚠️ $${money(data.payment.overpayment).toFixed(2)} overpayment credit created` : '';
        setSuccess(`✅ Payment recorded for ${customerName} — Cash $${cash.toFixed(2)}${creditMsg}${allocatedMsg}${overpaymentMsg} | New balance: $${newBalance.toFixed(2)}`);
        setFormData({ customer_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', reference_number: '', notes: '' });
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

  const hasAllocation    = customerInvoices.length > 0 || customerCredits.length > 0;
  const balanceImpact    = money(allocatedToInvoices + Math.max(0, money(cashAmount - allocatedToInvoices)));
  const projectedBalance = money(currentBalance - balanceImpact);
  const isReversal       = cashAmount < 0;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button onClick={() => router.push('/admin/ar')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to AR
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-green-600" />
          Record Payment
        </h1>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex justify-between items-center">
            <span className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              {success}
            </span>
            <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800 font-bold ml-4 text-lg">✕</button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search customers..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500" />
            </div>
            <select value={formData.customer_id}
              onChange={(e) => { setFormData({ ...formData, customer_id: e.target.value }); setAllocations([]); }}
              required className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500">
              <option value="">Select a customer</option>
              {filteredCustomers.map((customer) => {
                const balance = money(customer.balance);
                const name    = customer?.business_name || customer?.contact_name || 'Unknown';
                return (
                  <option key={customer.id} value={customer.id}>
                    {name} — Balance: ${balance.toFixed(2)}
                  </option>
                );
              })}
            </select>

            {/* ── Unapplied credit banner ── */}
            {selectedCustomer && unappliedTotal > 0 && (
              <div className="mt-3 p-4 bg-amber-50 border-2 border-amber-400 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 text-sm">
                      Unapplied credit of ${unappliedTotal.toFixed(2)} on this account
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {unappliedCredits.length} credit{unappliedCredits.length !== 1 ? 's' : ''} not yet applied to invoices.
                      Apply now to reduce the outstanding balance.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApplyNow}
                  className="shrink-0 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 whitespace-nowrap"
                >
                  Apply Now →
                </button>
              </div>
            )}

            {selectedCustomer && (
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">Current Balance</p>
                  <p className="text-xl font-bold text-blue-800">${currentBalance.toFixed(2)}</p>
                </div>
                {(cashAmount !== 0 || creditPoolAmount > 0) && (
                  <>
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <p className="text-xs text-purple-600 mb-1">
                        {isReversal ? 'Reversal Amount' : 'Available to Allocate'}
                      </p>
                      <p className="text-xl font-bold text-purple-800">${Math.abs(totalAvailable).toFixed(2)}</p>
                      {creditPoolAmount > 0 && cashAmount >= 0 && (
                        <p className="text-[10px] text-purple-500 mt-0.5">
                          ${cashAmount.toFixed(2)} cash + ${creditPoolAmount.toFixed(2)} credit
                        </p>
                      )}
                    </div>
                    <div className={`p-3 rounded border ${isReversal ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className={`text-xs mb-1 ${isReversal ? 'text-red-600' : 'text-green-600'}`}>
                        {isReversal ? 'Balance After Reversal' : 'New Balance'}
                      </p>
                      <p className={`text-xl font-bold ${isReversal ? 'text-red-800' : 'text-green-800'}`}>
                        ${projectedBalance.toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Cash Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cash Amount Received{' '}
              <span className="text-gray-400 font-normal">
                (enter $0 if paying with credit only • use negative to reverse)
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
              <input type="number" step="0.01" min="-999999" value={formData.amount}
                onChange={(e) => {
                  const newCash = money(e.target.value);
                  setFormData({ ...formData, amount: e.target.value });
                  const newPool = money(newCash + creditPoolAmount);
                  setAllocations(prev => {
                    let pool       = newPool;
                    const creds    = prev.filter(a => a.is_credit);
                    const invs     = prev.filter(a => !a.is_credit);
                    const adjusted: Allocation[] = [];
                    for (const inv of invs) {
                      const fit = money(Math.min(inv.amount, Math.max(0, pool)));
                      if (fit > 0) { adjusted.push({ ...inv, amount: fit }); pool = money(pool - fit); }
                    }
                    return [...creds, ...adjusted];
                  });
                }}
                placeholder="0.00"
                className={`w-full pl-8 pr-4 py-3 text-lg border rounded-md focus:ring-2 focus:ring-green-500 ${
                  cashAmount < 0 ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400' : 'border-gray-300'
                }`}
              />
            </div>
            {cashAmount < 0 && (
              <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800 flex items-start gap-2">
                <span className="text-base leading-none">↩️</span>
                <div>
                  <p className="font-semibold">Payment Reversal</p>
                  <p className="mt-0.5">This will <strong>add ${Math.abs(cashAmount).toFixed(2)}</strong> back to the customer&apos;s balance.</p>
                </div>
              </div>
            )}
          </div>

          {/* Allocation Panel */}
          {formData.customer_id && hasAllocation && cashAmount >= 0 && (
            <div ref={allocationPanelRef} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Apply Funds to Invoices
                </h3>
                <button type="button" onClick={handleAutoAllocate}
                  className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Auto-Allocate (Oldest First)
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {/* Credits */}
                {customerCredits.length > 0 && (
                  <div className="mb-1">
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <MinusCircle className="h-3 w-3" /> Available Credits — tick to add to allocatable pool
                    </p>
                    {customerCredits.map((credit) => {
                      const remaining  = money(money(credit.amount) - money(credit.amount_paid));
                      if (remaining <= 0) return null;
                      const isIncluded = allocations.some(a => a.invoice_id === credit.id && a.is_credit);
                      return (
                        <div key={credit.id}
                          className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors mb-1 ${
                            isIncluded ? 'bg-orange-50 border-orange-300' : 'bg-white hover:bg-orange-50 border-orange-200'
                          }`}
                          onClick={() => handleToggleCredit(credit)}>
                          <input type="checkbox" checked={isIncluded} onChange={() => {}} className="w-5 h-5 accent-orange-500 shrink-0 cursor-pointer" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-orange-700">
                              {credit.invoice_number
                                ? `Credit Note #${String(credit.invoice_number).padStart(6, '0')}`
                                : credit.description || 'Credit Note'}
                            </p>
                          </div>
                          <span className="text-orange-600 font-bold text-sm whitespace-nowrap">+${remaining.toFixed(2)} pool</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Invoices */}
                {customerInvoices.length > 0 && (
                  <div>
                    {customerCredits.length > 0 && (
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invoices</p>
                    )}
                    {customerInvoices.map((invoice) => {
                      const total          = money(invoice?.total_amount);
                      const paid           = money(invoice?.amount_paid);
                      const due            = money(total - paid);
                      const alloc          = allocations.find((a) => a?.invoice_id === invoice.id && !a.is_credit);
                      const allocated      = money(alloc?.amount || 0);
                      const isTicked       = allocated > 0;
                      const isShort        = isTicked && allocated < due;
                      const isAcceptedFull = !!alloc?.accept_as_full;

                      if (due < 0.01)                  return null;
                      if (invoice.status === 'cancelled') return null;
                      if (invoice.invoice_number == null) return null;

                      return (
                        <div key={invoice.id}
                          className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors mb-1 ${
                            isTicked ? 'bg-green-50 border-green-300' : 'bg-white hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => handleTickInvoice(invoice)}>
                          <input type="checkbox" checked={isTicked} onChange={() => {}} className="w-5 h-5 accent-green-600 shrink-0 cursor-pointer" />
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold text-gray-800">
                              {invoice.is_weekly ? 'Weekly ' : ''}Invoice #{String(invoice.invoice_number).padStart(6, '0')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(invoice.delivery_date + 'T00:00:00').toLocaleDateString('en-AU')}
                              {' • '}Total: ${total.toFixed(2)}
                              {' • '}
                              <span className={due > 0 ? 'text-red-600 font-medium' : ''}>Due: ${due.toFixed(2)}</span>
                            </p>
                          </div>
                          <div className="w-40" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                              <input type="number" step="0.01" min="0" max={due}
                                value={allocated || ''}
                                onChange={(e) => handleManualAllocate(invoice.id, money(e.target.value))}
                                placeholder="0.00"
                                className="w-full pl-5 pr-2 py-1 text-sm border rounded focus:outline-none focus:border-green-500" />
                            </div>
                            {isShort && (
                              <div className="mt-1">
                                <p className="text-[10px] text-amber-600">Short by ${(due - allocated).toFixed(2)}</p>
                                <label className="flex items-center gap-1 mt-0.5 cursor-pointer">
                                  <input type="checkbox" className="w-3.5 h-3.5 accent-green-500"
                                    checked={isAcceptedFull}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setAllocations(prev => prev.map(a =>
                                        a.invoice_id === invoice.id && !a.is_credit
                                          ? { ...a, accept_as_full: e.target.checked, short_amount: e.target.checked ? money(due - allocated) : 0 }
                                          : a
                                      ));
                                    }} />
                                  <span className="text-[10px] text-green-700 font-medium">Accept as full</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary */}
              {(allocations.length > 0 || creditPoolAmount > 0) && (
                <div className="mt-3 pt-3 border-t space-y-1 text-xs">
                  {creditPoolAmount > 0 && <p className="text-orange-600">Credit pool: <strong>${creditPoolAmount.toFixed(2)}</strong></p>}
                  {cashAmount > 0 && <p className="text-blue-600">Cash: <strong>${cashAmount.toFixed(2)}</strong></p>}
                  <p className="text-gray-700">Total available: <strong>${totalAvailable.toFixed(2)}</strong></p>
                  <p className="text-green-600">Allocated to invoices: <strong>${allocatedToInvoices.toFixed(2)}</strong></p>
                  {Math.abs(unallocatedAmount) > 0.005 && (
                    <p className={unallocatedAmount > 0 ? 'text-yellow-700' : 'text-red-600'}>
                      {unallocatedAmount > 0
                        ? `Unallocated: $${unallocatedAmount.toFixed(2)} (will reduce overall balance / create credit)`
                        : `⚠️ Over-allocated by $${Math.abs(unallocatedAmount).toFixed(2)}`}
                    </p>
                  )}
                </div>
              )}

              {totalAvailable > totalOutstanding + 0.01 && (
                <div className="mt-3 p-3 rounded text-sm bg-amber-50 border border-amber-400 text-amber-900 flex items-start gap-2">
                  <span className="text-lg leading-none">⚠️</span>
                  <div>
                    <p className="font-semibold">Funds exceed outstanding invoices</p>
                    <p className="mt-0.5">
                      A credit of <strong>${money(totalAvailable - totalOutstanding).toFixed(2)}</strong> will
                      be created for the remaining unallocated amount.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date *</label>
            <input type="date" value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              required className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
            <select value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              required className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500">
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reference Number</label>
            <input type="text" value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="Check #, Transaction ID, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3} placeholder="Optional notes"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              <Save className="h-4 w-4" />
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
            <button type="button" onClick={() => router.push('/admin/ar')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50">
              Back to AR
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}