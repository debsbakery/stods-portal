'use client'

import { useState } from 'react'

interface Props {
  labourPct: number
  labourIsActual: boolean
  labourNotes: string
  overheadPerKg: number
  overheadIsActual: boolean
  overheadNotes: string
}

export default function CostSettingsView({
  labourPct,
  labourIsActual,
  labourNotes,
  overheadPerKg,
  overheadIsActual,
  overheadNotes,
}: Props) {
  const [labour, setLabour] = useState(String(labourPct))
  const [labourActual, setLabourActual] = useState(labourIsActual)
  const [labourNote, setLabourNote] = useState(labourNotes)

  const [overhead, setOverhead] = useState(String(overheadPerKg))
  const [overheadActual, setOverheadActual] = useState(overheadIsActual)
  const [overheadNote, setOverheadNote] = useState(overheadNotes)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/admin/cost-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labour_pct: parseFloat(labour),
        labour_is_actual: labourActual,
        labour_notes: labourNote,
        overhead_per_kg: parseFloat(overhead),
        overhead_is_actual: overheadActual,
        overhead_notes: overheadNote,
      }),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: json.error ?? 'Failed to save settings' })
    } else {
      setMessage({ type: 'success', text: 'Settings saved successfully' })
    }
  }

  const labourNum = parseFloat(labour) || 0
  const overheadNum = parseFloat(overhead) || 0
  const profitTarget = 100 - labourNum - 30 // 30% estimated ingredients

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cost Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Global defaults used when a product has no override set.
          Target split: 30% ingredients / 30% labour / 30% overhead / 10% profit.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Labour % */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <label className="block text-sm font-semibold text-gray-700">
                Global Labour %
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                % of sale price allocated to labour. Products can override this individually.
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-indigo-600">{labourNum.toFixed(1)}%</span>
              <div className="mt-1">
                {labourActual ? (
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                    Actual
                  </span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                    Estimate
                  </span>
                )}
              </div>
            </div>
          </div>

          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={labour}
            onChange={(e) => setLabour(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={labourActual}
              onChange={(e) => setLabourActual(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">
              Mark as <strong>actual</strong> (based on real time tracking, not estimate)
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={labourNote}
              onChange={(e) => setLabourNote(e.target.value)}
              placeholder="e.g. Based on timed bake sessions March 2026"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Overhead $/kg */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <label className="block text-sm font-semibold text-gray-700">
                Overhead Rate ($ per kg)
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                Applied as: product weight (kg) x this rate.
                Covers rent, power, packaging, equipment.
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-indigo-600">${overheadNum.toFixed(2)}/kg</span>
              <div className="mt-1">
                {overheadActual ? (
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                    Actual
                  </span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                    Estimate
                  </span>
                )}
              </div>
            </div>
          </div>

          <input
            type="number"
            min="0"
            step="0.01"
            value={overhead}
            onChange={(e) => setOverhead(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overheadActual}
              onChange={(e) => setOverheadActual(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">
              Mark as <strong>actual</strong> (based on real expense tracking, not estimate)
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={overheadNote}
              onChange={(e) => setOverheadNote(e.target.value)}
              placeholder="e.g. Based on quarterly power + rent March 2026"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Live split preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">
            Estimated Cost Split Preview
            <span className="text-xs font-normal text-gray-400 ml-2">
              (overhead varies by product weight)
            </span>
          </p>
          <div className="space-y-3">
            {[
              { label: 'Ingredients (estimated avg)', pct: 30, color: 'bg-amber-400' },
              { label: 'Labour', pct: labourNum, color: 'bg-blue-400' },
              { label: 'Overhead', pct: null, color: 'bg-purple-400', note: `$${overheadNum.toFixed(2)}/kg` },
              {
                label: 'Profit target (estimated)',
                pct: profitTarget,
                color: profitTarget >= 10 ? 'bg-green-400' : 'bg-red-400',
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${row.color}`} />
                <span className="text-sm text-gray-600 flex-1">{row.label}</span>
                <span className="text-sm font-semibold text-gray-800 tabular-nums">
                  {row.note ?? `${row.pct?.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>

          {/* Bar chart visual */}
          <div className="mt-4 flex rounded-full overflow-hidden h-4 gap-px">
            <div className="bg-amber-400" style={{ width: '30%' }} title="Ingredients 30%" />
            <div className="bg-blue-400" style={{ width: `${Math.min(labourNum, 100)}%` }} title={`Labour ${labourNum}%`} />
            <div className="bg-purple-400" style={{ width: '10%' }} title="Overhead (variable)" />
            <div
              className={profitTarget >= 10 ? 'bg-green-400' : 'bg-red-400'}
              style={{ width: `${Math.max(0, Math.min(profitTarget, 100))}%` }}
              title={`Profit ${profitTarget}%`}
            />
          </div>

          {profitTarget < 10 && (
            <p className="text-xs text-red-600 mt-3 font-medium">
              Warning: estimated profit margin is below the 10% target.
            </p>
          )}
        </div>

        {/* Message */}
        {message && (
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

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}