// components/ui/pin-gate.tsx
'use client'

import { useState } from 'react'
import { X, Lock } from 'lucide-react'

const ADMIN_PIN = '8432'
const SESSION_KEY = 'admin_pin_verified'
const SESSION_DURATION = 30 * 60 * 1000

export function isPinVerified(): boolean {
  if (typeof window === 'undefined') return false
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return false
  if (Date.now() > parseInt(stored, 10)) {
    sessionStorage.removeItem(SESSION_KEY)
    return false
  }
  return true
}

export function setPinVerified() {
  sessionStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DURATION))
}

interface PinGateProps {
  onSuccess: () => void
  onCancel: () => void
  title?: string
}

export default function PinGate({ onSuccess, onCancel, title = 'Enter Admin PIN' }: PinGateProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  function handleKeypad(digit: string) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    setError(false)
    if (newPin.length === 4) {
      if (newPin === ADMIN_PIN) {
        setPinVerified()
        onSuccess()
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 500)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 ${shake ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
        onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-bold text-gray-900">{title}</span>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-gray-200 rounded"><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="p-6 flex flex-col items-center">
          <div className="flex gap-3 mb-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > i ? (error ? 'bg-red-500 border-red-500' : 'bg-amber-700 border-amber-700') : 'border-gray-300'
              }`} />
            ))}
          </div>
          {error && <p className="text-xs text-red-500 mt-1">Wrong PIN</p>}
        </div>
        <div className="px-6 pb-6 grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => {
            if (key === '') return <div key={i} />
            return (
              <button key={i} onClick={() => key === '⌫' ? setPin(p => p.slice(0, -1)) : handleKeypad(key)}
                className="h-12 rounded-lg bg-gray-50 text-gray-900 text-lg font-medium hover:bg-gray-100 active:bg-gray-200">
                {key}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}