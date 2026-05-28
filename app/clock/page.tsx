// app/clock/page.tsx
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ClockPageContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [step,      setStep]      = useState<'validate'|'pin'|'done'|'error'|'change-pin'>('validate')
  const [pin,       setPin]       = useState('')
  const [mode,      setMode]      = useState<'in'|'out'>('in')
  const [location,  setLocation]  = useState<any>(null)
  const [gpsCoords, setGpsCoords] = useState<{lat:number;lng:number}|null>(null)
  const [gpsError,  setGpsError]  = useState<string|null>(null)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<any>(null)
  const [errorMsg,  setErrorMsg]  = useState('')

  // Change PIN state
  const [cpStep,       setCpStep]       = useState<'current'|'new'|'confirm'>('current')
  const [cpCurrentPin, setCpCurrentPin] = useState('')
  const [cpNewPin,     setCpNewPin]     = useState('')
  const [cpConfirmPin, setCpConfirmPin] = useState('')
  const [cpLoading,    setCpLoading]    = useState(false)
  const [cpError,      setCpError]      = useState('')
  const [cpSuccess,    setCpSuccess]    = useState('')

  // ── Validate QR token on mount ──────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStep('error')
      setErrorMsg('Invalid QR code — please scan again.')
      return
    }
    fetch(`/api/clock/qr?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setLocation(data.location)
          setStep('pin')
          navigator.geolocation?.getCurrentPosition(
            pos => setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            ()  => setGpsError('GPS unavailable — clock-in will be flagged'),
            { timeout: 8000, enableHighAccuracy: true }
          )
        } else {
          setStep('error')
          setErrorMsg(data.error ?? 'Invalid QR code')
        }
      })
      .catch(() => {
        setStep('error')
        setErrorMsg('Network error — please try again')
      })
  }, [token])

  // ── Submit clock in/out ─────────────────────────────────────────────
  const doSubmit = useCallback(async (currentPin: string) => {
    if (currentPin.length !== 4 || loading) return
    setLoading(true)
    setErrorMsg('')

    try {
      const endpoint = mode === 'in' ? '/api/clock/in' : '/api/clock/out'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pin:   currentPin,
          token,
          lat:   gpsCoords?.lat ?? null,
          lng:   gpsCoords?.lng ?? null,
        }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setResult(data)
        setStep('done')
        setPin('')
        // Auto-reset after 15 seconds (longer to allow Change PIN click)
        setTimeout(() => {
          setStep(prev => prev === 'done' ? 'pin' : prev)
          setResult(null)
          setMode('in')
          setErrorMsg('')
        }, 15000)
      } else {
        setErrorMsg(data.error ?? 'Something went wrong')
        setPin('')
        if (res.status === 409 && (data.already_in || data.not_in)) {
          setMode(prev => prev === 'in' ? 'out' : 'in')
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Network error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [mode, token, gpsCoords, loading])

  // ── Auto-submit when PIN reaches 4 digits ───────────────────────────
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (pin.length === 4 && step === 'pin' && !loading && !submitting) {
      setSubmitting(true)
      doSubmit(pin).finally(() => setSubmitting(false))
    }
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Change PIN: auto-advance on 4 digits ────────────────────────────
  useEffect(() => {
    if (step !== 'change-pin') return

    if (cpStep === 'current' && cpCurrentPin.length === 4) {
      setCpStep('new')
    }
    if (cpStep === 'new' && cpNewPin.length === 4) {
      setCpStep('confirm')
    }
    if (cpStep === 'confirm' && cpConfirmPin.length === 4) {
      submitPinChange()
    }
  }, [cpCurrentPin, cpNewPin, cpConfirmPin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitPinChange() {
    if (cpNewPin !== cpConfirmPin) {
      setCpError('PINs do not match. Try again.')
      setCpConfirmPin('')
      setCpStep('new')
      setCpNewPin('')
      return
    }
    if (cpNewPin === cpCurrentPin) {
      setCpError('New PIN must be different from current PIN.')
      setCpConfirmPin('')
      setCpStep('new')
      setCpNewPin('')
      return
    }

    setCpLoading(true)
    setCpError('')
    try {
      const res = await fetch('/api/clock/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin: cpCurrentPin, new_pin: cpNewPin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change PIN')
      setCpSuccess(`PIN changed successfully for ${data.name}!`)
      setTimeout(() => {
        resetChangePin()
        setStep('pin')
      }, 4000)
    } catch (err: any) {
      setCpError(err.message)
      setCpConfirmPin('')
      setCpNewPin('')
      setCpStep('new')
    } finally {
      setCpLoading(false)
    }
  }

  function resetChangePin() {
    setCpStep('current')
    setCpCurrentPin('')
    setCpNewPin('')
    setCpConfirmPin('')
    setCpError('')
    setCpSuccess('')
    setCpLoading(false)
  }

  function openChangePin() {
    resetChangePin()
    setStep('change-pin')
  }

  function addDigit(digit: string) {
    if (step === 'pin' && pin.length < 4 && !loading) {
      setPin(prev => prev + digit)
    }
    if (step === 'change-pin') {
      if (cpStep === 'current' && cpCurrentPin.length < 4) setCpCurrentPin(prev => prev + digit)
      if (cpStep === 'new' && cpNewPin.length < 4) setCpNewPin(prev => prev + digit)
      if (cpStep === 'confirm' && cpConfirmPin.length < 4) setCpConfirmPin(prev => prev + digit)
    }
  }

  function delDigit() {
    if (step === 'pin') setPin(prev => prev.slice(0, -1))
    if (step === 'change-pin') {
      if (cpStep === 'current') setCpCurrentPin(prev => prev.slice(0, -1))
      if (cpStep === 'new') setCpNewPin(prev => prev.slice(0, -1))
      if (cpStep === 'confirm') setCpConfirmPin(prev => prev.slice(0, -1))
    }
  }

  function getCurrentCpPin() {
    if (cpStep === 'current') return cpCurrentPin
    if (cpStep === 'new') return cpNewPin
    return cpConfirmPin
  }

  const primary = '#3E1F00'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: '#fdf6f0' }}
    >
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-2">🍞</div>
        <h1 className="text-2xl font-bold" style={{ color: primary }}>
          Staff Clock
        </h1>
        {location && (
          <p className="text-gray-500 text-sm mt-1">{location.name}</p>
        )}
      </div>

      {/* ── Validating ── */}
      {step === 'validate' && (
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: primary, borderTopColor: 'transparent' }}
          />
          <p className="text-gray-600">Validating QR code...</p>
        </div>
      )}

      {/* ── Error ── */}
      {step === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-sm">
          <p className="text-4xl mb-3">❌</p>
          <p className="font-semibold text-red-800">{errorMsg}</p>
          <p className="text-red-600 text-sm mt-2">
            Ask your manager to regenerate the QR code.
          </p>
        </div>
      )}

      {/* ── PIN Entry ── */}
      {step === 'pin' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-xs">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border mb-5">
            <button
              onClick={() => { setMode('in'); setPin(''); setErrorMsg('') }}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={mode === 'in'
                ? { backgroundColor: primary, color: 'white' }
                : { color: '#6b7280' }}
            >
              Clock IN
            </button>
            <button
              onClick={() => { setMode('out'); setPin(''); setErrorMsg('') }}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={mode === 'out'
                ? { backgroundColor: '#dc2626', color: 'white' }
                : { color: '#6b7280' }}
            >
              Clock OUT
            </button>
          </div>

          <p className="text-center text-gray-600 text-sm mb-4 font-medium">
            Enter your 4-digit PIN
          </p>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="w-5 h-5 rounded-full border-2 transition-all duration-150"
                style={{
                  backgroundColor: pin.length > i ? primary : 'transparent',
                  borderColor:     primary,
                  transform:       pin.length > i ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button
                key={d}
                onClick={() => addDigit(String(d))}
                disabled={loading}
                className="h-14 rounded-xl text-xl font-semibold bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => addDigit('0')}
              disabled={loading}
              className="h-14 rounded-xl text-xl font-semibold bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40"
            >
              0
            </button>
            <button
              onClick={delDigit}
              disabled={loading}
              className="h-14 rounded-xl text-xl font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-40"
            >
              ⌫
            </button>
          </div>

          {loading && (
            <div className="flex justify-center mt-5">
              <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
              {errorMsg}
            </div>
          )}

          {gpsError && <p className="text-xs text-amber-600 text-center mt-3">⚠️ {gpsError}</p>}
          {gpsCoords && !gpsError && <p className="text-xs text-green-600 text-center mt-3">📍 GPS active</p>}

          {/* Change PIN link */}
          <button
            onClick={openChangePin}
            className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 transition"
          >
            Change PIN
          </button>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && result && (
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="text-6xl mb-4">
            {mode === 'in' ? '✅' : '👋'}
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: primary }}>
            {result.staff_name}
          </h2>
          <p className="text-lg font-semibold text-gray-700">
            {mode === 'in' ? 'Clocked In' : 'Clocked Out'}
          </p>

          <p className="text-5xl font-bold mt-3" style={{ color: primary }}>
            {result.raw_time ?? (mode === 'in' ? result.clocked_in : result.clocked_out)}
          </p>

          {result.is_early_late && result.clocked_in !== result.raw_time && mode === 'in' && (
            <p className="text-xs text-gray-500 mt-2">
              Paid from {result.clocked_in}
            </p>
          )}

          {mode === 'out' && Number(result.paid_hours) > 0 && (
            <p className="text-gray-500 mt-3 text-sm">
              {Number(result.paid_hours).toFixed(2)} hours worked today
            </p>
          )}

          {result.flags?.length > 0 && (
            <div className="mt-4 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              ⚠️ {result.flags.join(', ')}
            </div>
          )}

          <p className="text-gray-400 text-xs mt-6">
            Resetting in a few seconds...
          </p>
        </div>
      )}

      {/* ── Change PIN ── */}
      {step === 'change-pin' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-xs">
          <h2 className="text-center font-bold text-lg mb-1" style={{ color: primary }}>
            Change PIN
          </h2>

          {cpSuccess ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">✅</div>
              <p className="font-semibold text-green-700">{cpSuccess}</p>
              <p className="text-gray-400 text-xs mt-3">Returning to clock screen...</p>
            </div>
          ) : (
            <>
              <p className="text-center text-gray-500 text-sm mb-4">
                {cpStep === 'current' && 'Enter your current PIN'}
                {cpStep === 'new' && 'Enter your new PIN'}
                {cpStep === 'confirm' && 'Confirm your new PIN'}
              </p>

              {/* Step indicator */}
              <div className="flex justify-center gap-2 mb-4">
                {['current', 'new', 'confirm'].map((s, i) => (
                  <div
                    key={s}
                    className="w-2 h-2 rounded-full transition-all"
                    style={{
                      backgroundColor: ['current', 'new', 'confirm'].indexOf(cpStep) >= i ? primary : '#d1d5db',
                    }}
                  />
                ))}
              </div>

              {/* PIN dots */}
              <div className="flex justify-center gap-4 mb-6">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border-2 transition-all duration-150"
                    style={{
                      backgroundColor: getCurrentCpPin().length > i ? primary : 'transparent',
                      borderColor: primary,
                      transform: getCurrentCpPin().length > i ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>

              {/* Number pad */}
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9].map(d => (
                  <button
                    key={d}
                    onClick={() => addDigit(String(d))}
                    disabled={cpLoading}
                    className="h-14 rounded-xl text-xl font-semibold bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {d}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => addDigit('0')}
                  disabled={cpLoading}
                  className="h-14 rounded-xl text-xl font-semibold bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40"
                >
                  0
                </button>
                <button
                  onClick={delDigit}
                  disabled={cpLoading}
                  className="h-14 rounded-xl text-xl font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-40"
                >
                  ⌫
                </button>
              </div>

              {cpLoading && (
                <div className="flex justify-center mt-5">
                  <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
                </div>
              )}

              {cpError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
                  {cpError}
                </div>
              )}
            </>
          )}

          {/* Back button */}
          {!cpSuccess && (
            <button
              onClick={() => { resetChangePin(); setStep('pin') }}
              className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              ← Back to clock
            </button>
          )}
        </div>
      )}

      {/* Current time */}
      <div className="mt-8 text-gray-400 text-sm">
        {new Date().toLocaleTimeString('en-AU', {
          timeZone: 'Australia/Perth',
          hour:     '2-digit',
          minute:   '2-digit',
        })}
      </div>
    </div>
  )
}

export default function ClockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <ClockPageContent />
    </Suspense>
  )
}