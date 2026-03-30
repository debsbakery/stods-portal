'use client';
import { useState, useCallback } from 'react';

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

  const updateRow = useCallback((id: string, field: string, value: string) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;

      const updated = { ...row, [field]: value };
      const cost = parseFloat(updated.cost) || 0;
      const margin = parseFloat(updated.marginPercent) || 0;

      switch (field) {
        case 'cost': {
          if (margin > 0 && margin < 100) {
            const spExGst = cost / (1 - margin / 100);
            const gst = spExGst * GST_RATE;
            updated.salePriceExGst = spExGst.toFixed(2);
            updated.gst = gst.toFixed(2);
            updated.salePriceIncGst = (spExGst + gst).toFixed(2);
          }
          break;
        }
        case 'marginPercent': {
          if (cost > 0 && margin > 0 && margin < 100) {
            const spExGst = cost / (1 - margin / 100);
            const gst = spExGst * GST_RATE;
            updated.salePriceExGst = spExGst.toFixed(2);
            updated.gst = gst.toFixed(2);
            updated.salePriceIncGst = (spExGst + gst).toFixed(2);
          }
          break;
        }
        case 'salePriceIncGst': {
          const spInc = parseFloat(value) || 0;
          if (spInc > 0) {
            const spExGst = spInc / (1 + GST_RATE);
            const gst = spInc - spExGst;
            updated.salePriceExGst = spExGst.toFixed(2);
            updated.gst = gst.toFixed(2);
            if (cost > 0) {
              updated.marginPercent = (((spExGst - cost) / spExGst) * 100).toFixed(2);
            }
          }
          break;
        }
        case 'salePriceExGst': {
          const spEx = parseFloat(value) || 0;
          if (spEx > 0) {
            const gst = spEx * GST_RATE;
            updated.gst = gst.toFixed(2);
            updated.salePriceIncGst = (spEx + gst).toFixed(2);
            if (cost > 0) {
              updated.marginPercent = (((spEx - cost) / spEx) * 100).toFixed(2);
            }
          }
          break;
        }
        case 'gst': {
          const gstVal = parseFloat(value) || 0;
          const spEx = parseFloat(updated.salePriceExGst) || 0;
          if (spEx > 0) {
            updated.salePriceIncGst = (spEx + gstVal).toFixed(2);
          }
          break;
        }
      }

      return updated;
    }));
  }, []);

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const removeRow = (id: string) => {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  };

  const clearAll = () => setRows([emptyRow()]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">💰 Price &amp; Margin Calculator</h3>
          <p className="text-sm text-gray-500">Edit any field — the others recalculate automatically</p>
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
        💡 GST calculated at 10%. Margin = (Price ex GST − Cost) ÷ Price ex GST. Markup = (Price ex GST − Cost) ÷ Cost.
      </p>
    </div>
  );
}