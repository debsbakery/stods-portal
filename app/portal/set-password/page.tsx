'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [done, setDone]           = useState(false)
  const supabase = createClient()
  const router   = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/portal'), 2000)
    }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-green-700 font-bold text-lg">✅ Password set!</p>
        <p className="text-gray-500 mt-2">Redirecting to portal...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Set Your Password</h1>
        <p className="text-gray-500 text-sm mb-6">
          Choose a password to use for future logins.
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500"
              placeholder="Repeat password"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 px-4 text-white rounded-md font-medium disabled:opacity-50"
            style={{ backgroundColor: '#006A4E' }}
          >
            {saving ? 'Saving...' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  )
}