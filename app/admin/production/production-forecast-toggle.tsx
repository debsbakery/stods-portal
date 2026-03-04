'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import ProductionForecastView from './production-forecast-view'

export default function ProductionForecastToggle() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-lg shadow-md border hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-gray-500" />
          <div className="text-left">
            <p className="font-semibold text-gray-800">Production Forecast</p>
            <p className="text-xs text-gray-500">
              Advanced forecasting based on orders, standing orders and history
            </p>
          </div>
        </div>
        {open
          ? <ChevronDown  className="h-5 w-5 text-gray-400" />
          : <ChevronRight className="h-5 w-5 text-gray-400" />
        }
      </button>

      {open && (
        <div className="mt-4">
          <ProductionForecastView />
        </div>
      )}
    </div>
  )
}