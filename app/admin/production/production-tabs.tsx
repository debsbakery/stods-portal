'use client'

import { useState } from 'react'
import { FileText, Calculator, Grid3X3 } from 'lucide-react'
import ProductionSheetLauncher from './production-sheet-launcher'
import ProductionForecastToggle from './production-forecast-toggle'
import DoughCalculator from './dough-calculator'

const TABS = [
  { id: 'sheets',  label: 'Production Sheets', icon: FileText },
  { id: 'dough',   label: 'Dough Calculator',  icon: Calculator },
  { id: 'packing', label: 'Packing Grid',      icon: Grid3X3 },
] as const

type TabId = typeof TABS[number]['id']

export default function ProductionTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('sheets')

  return (
    <div>
      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(tab => {
          const Icon    = tab.icon
          const active  = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                active
                  ? 'border-green-700 text-green-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'sheets' && (
        <div>
          <ProductionSheetLauncher inline />
          <ProductionForecastToggle />
        </div>
      )}

         {activeTab === 'dough' && (
        <DoughCalculator />
      )}

      {activeTab === 'packing' && (
        <div className="text-center py-8">
          <Grid3X3 className="h-12 w-12 mx-auto mb-3 text-green-700 opacity-60" />
          <p className="text-gray-600 mb-4">Full-page packing grid with customer columns</p>
          <a href="/admin/production/packing-grid"
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800">
            <Grid3X3 className="h-4 w-4" /> Open Packing Grid
          </a>
        </div>
      )}
    </div>
  )
}