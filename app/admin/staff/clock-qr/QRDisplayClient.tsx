// app/admin/staff/clock-qr/qr-display.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

interface QREntry { id: string; token: string; active: boolean }
interface Location { id: string; name: string; staff_qr_codes: QREntry[] }

export default function QRDisplay({ locations }: { locations: Location[] }) {
  const router  = useRouter()
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({})
  const [refreshing, setRefreshing] = useState<string | null>(null)

  useEffect(() => {
    locations.forEach(async loc => {
      const activeQR = loc.staff_qr_codes.find(q => q.active)
      if (!activeQR) return

      const siteUrl = window.location.origin
      const url     = `${siteUrl}/clock?token=${activeQR.token}`

      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width:           400,
          margin:          2,
          color:           { dark: '#3E1F00', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
        })
        setQrDataUrls(prev => ({ ...prev, [loc.id]: dataUrl }))
      } catch (e) {
        console.error('QR generation failed', e)
      }
    })
  }, [locations])

  async function handleRefresh(locationId: string) {
    if (!confirm('Generate a new QR code? The old code will stop working immediately.')) return
    setRefreshing(locationId)
    try {
      const res  = await fetch('/api/admin/staff/refresh-qr', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ location_id: locationId }),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setRefreshing(null)
    }
  }

  if (locations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
        <p>No active locations found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {locations.map(loc => {
        const activeQR  = loc.staff_qr_codes.find(q => q.active)
        const qrDataUrl = qrDataUrls[loc.id]
        const clockUrl  = activeQR
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/clock?token=${activeQR.token}`
          : null

        return (
          <div key={loc.id} className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">{loc.name}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm
                             hover:bg-gray-200 font-medium">
                  🖨️ Print
                </button>
                <button
                  onClick={() => handleRefresh(loc.id)}
                  disabled={refreshing === loc.id}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm
                             hover:bg-red-200 font-medium disabled:opacity-50">
                  {refreshing === loc.id ? 'Refreshing...' : '🔄 Refresh Code'}
                </button>
              </div>
            </div>

            {activeQR && qrDataUrl ? (
              <div className="flex flex-col items-center">
                {/* QR Code */}
                <div className="border-4 rounded-2xl p-4" style={{ borderColor: '#3E1F00' }}>
                  <img src={qrDataUrl} alt="Clock-in QR code" className="w-64 h-64" />
                </div>

                {/* Instructions */}
                <div className="mt-4 text-center">
                  <p className="text-xl font-bold" style={{ color: '#3E1F00' }}>
                    🍞 {loc.name}
                  </p>
                  <p className="text-gray-600 mt-1">Scan to Clock In / Out</p>
                  <p className="text-xs text-gray-400 mt-2 font-mono break-all">
                    {clockUrl}
                  </p>
                </div>

                {/* Token info */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 w-full">
                  <p>Token: <span className="font-mono">{activeQR.token.slice(0, 8)}...</span></p>
                  <p className="mt-0.5">Permanent until manually refreshed</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                {activeQR ? 'Generating QR code...' : 'No QR code generated yet'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}