// components/ui/pin-protected.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PinGate, { isPinVerified, setPinVerified } from './pin-gate'

export default function PinProtected({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => { setVerified(isPinVerified()) }, [])

  if (verified === null) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>

  if (!verified) {
    return (
      <PinGate
        title="Enter PIN to Access"
        onSuccess={() => { setPinVerified(); setVerified(true) }}
        onCancel={() => router.push('/admin')}
      />
    )
  }

  return <>{children}</>
}