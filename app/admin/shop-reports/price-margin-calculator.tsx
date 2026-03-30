'use client';
import { useState, useCallback, useEffect, useRef } from 'react';

interface CalcRow {
  id: string;
  product: string;
  cost: string;
  gst: string;
  marginPercent: string;
  salePriceExGst: string;
  salePriceIncGst: string;
}

const GST_RATE = 0.10;

const emptyRow = (): CalcRow => ({
  id: crypto.randomUUID(),
  product: '',
  cost: '',
  gst: '',
  marginPercent: '',
  salePriceExGst: '',
  salePriceIncGst: '',
});

export default function PriceMarginCalculator() {
  const [rows, setRows] = useState<CalcRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load saved rows on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/price-calculator');
        const { rows: saved } = await res.json();
        if (saved && saved.length > 0) {
          const mapped: CalcRow[] = saved.map((r: any) => ({
            id: r.id,
            product: r.product || '',
            cost: r.cost ? String(r.cost) : '',
            gst: r.gst ? String(r.gst) : '',
            marginPercent: r.margin_percent ? String(r.margin_percent) : '',
            salePriceExGst: r.sale_price_ex_gst ? String(r.sale_price_ex_gst) : '',
            salePriceIncGst: r.sale_price_inc_gst ? String(r.sale_price_inc_gst) : '',
          }));
          setRows(mapped);
        }
      } catch (err) {
        console.error('Failed to load calculator rows:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Auto-save after 2 seconds of inactivity
  function triggerAutoSave(updatedRows: CalcRow[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave(updatedRows);
    }, 2000);
  }

  async function doSave(rowsToSave: CalcRow[]) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/price-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSave }),
      });
      if (res.ok) {
        setIsDirty(false);
        showToast('✅ Calculator saved');
      } else {
        showToast('❌ Save failed', false);
      }
    } catch {
      showToast('❌ Save failed', false);
    }
    setSaving(false);
  }

  const updateRow = useCallback((id: string, field: string, value: string) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;

        const newRow = { ...row, [field]: value };
        const cost = parseFloat(newRow.cost) || 0;
        const margin = parseFloat(newRow.marginPercent) || 0;

        switch (field) {
          case 'cost': {
            if (margin > 0 && margin < 100) {
              const spExGst = cost / (1 - margin / 100);
              const gst = spExGst * GST_RATE;
              newRow.salePriceExGst = spExGst.toFixed(2);
              newRow.gst = gst.toFixed(2);
              newRow.salePriceIncGst = (spExGst + gst).toFixed(2);
            }
            break;
          }
          case 'marginPercent': {
            if (cost > 0 && margin > 0 && margin < 100) {
              const spExGst = cost / (1 - margin / 100);
              const gst = spExGst * GST_RATE;
              newRow.salePriceExGst = spExGst.toFixed(2);
              newRow.gst = gst.toFixed(2);
              newRow.salePriceIncGst = (spExGst + gst).toFixed(2);
            }
            break;
          }
          case 'salePriceIncGst': {
            const spInc = parseFloat(value) || 0;
            if (spInc > 0) {
              const spExGst = spInc / (1 + GST_RATE);
              const gst = spInc - spExGst;
              newRow.salePriceExGst = spExGst.toFixed(2);
              newRow.gst = gst.toFixed(2);
              if (cost > 0) {
                newRow.marginPercent = (((spExGst - cost) / spExGst) * 100).toFixed(2);
              }
            }
            break;
          }
          case 'salePriceExGst': {
            const spEx = parseFloat(value) || 0;
            if (spEx > 0) {
              const gst = spEx * GST_RATE;
              newRow.gst = gst.toFixed(2);
              newRow.salePriceIncGst = (spEx + gst).toFixed(2);
              if (cost > 0) {
                newRow.marginPercent = (((spEx - cost) / spEx) * 100).toFixed(2);
              }
            }
            break;
          }
          case 'gst': {
            const gstVal = parseFloat(value) || 0;
            const spEx = parseFloat(newRow.salePriceExGst) || 0;
            if (spEx > 0) {
              newRow.salePriceIncGst = (spEx + gstVal).toFixed(2);
            }
            break;
          }
        }

        return newRow;
      });

      setIsDirty(true);
      triggerAutoSave(updated);
      return updated;
    });
  }, []);

  const addRow = () => {
    setRows(prev => {
      const updated = [...prev, emptyRow()];
      setIsDirty(true);
      triggerAutoSave(updated);
      return updated;
    });
  };

  const removeRow = (id: string) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter(r => r.id !== id);
      setIsDirty(true);
      triggerAutoSave(updated);
      return updated;
    });
  };

  const clearAll = () => {
    const fresh = [emptyRow()];
    setRows(fresh);
    setIsDirty(true);
    triggerAutoSave(fresh);
  };

  if (loading) {
    return <div className="p-8 text-gray-400">Loading calculator...</div>;
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white text-sm
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">💰 Price &amp; Margin Calculator</h3>
          <p className="text-sm text-gray-500">
            Edit any field — the others recalculate automatically.
            {saving && <span className="ml-2 text-blue-500">💾 Saving...</span>}
            {!saving && !isDirty && <span className="ml-2 text-green-500">✅ Saved</span>}
            {!saving && isDirty && <span className="ml-2 text-amber-500">● Unsaved changes</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
          >
            + Add Row
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
          >
            Clear All
          </button>
          <button
            onClick={() => doSave(rows)}
            disabled={saving || !isDirty}
            className={`px-3 py-1.5 text-sm rounded font-medium transition ${
              saving ? 'bg-blue-400 text-white cursor-wait'
                : isDirty ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-green-600 text-white'
            }`}
          >
            {saving ? '💾 Saving...' : isDirty ? '💾 Save' : '✅ Saved'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-3 font-semibold text-gray-600 min-w-[180px]">Product</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[110px]">Cost ($)</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[100px]">Margin %</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[110px]">Price ex GST</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[100px]">GST ($)</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[120px]">Sale Price ($)</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[100px]">Markup %</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-600 w-[100px]">Profit ($)</th>
              <th className="w-[50px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cost = parseFloat(row.cost) || 0;
              const spEx = parseFloat(row.salePriceExGst) || 0;
              const profit = spEx - cost;
              const markup = cost > 0 ? ((spEx - cost) / cost) * 100 : 0;

              return (
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.product}
                      onChange={(e) => updateRow(row.id, 'product', e.target.value)}
                      placeholder="Enter product name"
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.cost}
                      onChange={(e) => updateRow(row.id, 'cost', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.marginPercent}
                      onChange={(e) => updateRow(row.id, 'marginPercent', e.target.value)}
                      placeholder="0.00"
                      step="0.5"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.salePriceExGst}
                      onChange={(e) => updateRow(row.id, 'salePriceExGst', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.gst}
                      onChange={(e) => updateRow(row.id, 'gst', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.salePriceIncGst}
                      onChange={(e) => updateRow(row.id, 'salePriceIncGst', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="text-sm text-gray-600">
                      {markup !== 0 ? `${markup.toFixed(1)}%` : '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className={`font-semibold text-sm ${
                      profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      ${profit.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none"
                      title="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        💡 GST calculated at 10%. Auto-saves 2 seconds after last edit. Markup = (Price ex GST − Cost) ÷ Cost.
      </p>
    </div>
  );
}