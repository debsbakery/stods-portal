'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import Link from 'next/link'

const PORTAL_URL = 'https://orders.stodsbakery.com/portal'
const APPLY_URL  = 'https://orders.stodsbakery.com/register'

const PORTAL_QR  = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(PORTAL_URL)}&margin=10&color=2c2c2c`
const APPLY_QR   = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(APPLY_URL)}&margin=10&color=2c2c2c`

export default function PortalQRPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch('/api/auth/check-admin')
      .then(r => r.json())
      .then(d => {
        if (!d.isAdmin) router.push('/')
        else setReady(true)
      })
      .catch(() => router.push('/'))
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      <div className="print:hidden mb-6 flex items-center justify-between max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm hover:opacity-80"
          style={{ color: '#8B0000' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold hover:opacity-90"
          style={{ backgroundColor: '#2c2c2c' }}
        >
          <Printer className="h-4 w-4" /> Print Cards
        </button>
      </div>

      <div className="print:hidden">
        <h2 className="text-center text-base font-bold text-gray-700 uppercase tracking-wide">
          Customer Portal Cards
        </h2>
        <p className="text-center text-sm text-gray-500 mt-1 mb-6">
          For existing customers — scan to access their portal
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto print:grid-cols-2 print:gap-6 print:max-w-none print:m-0">
        {[0, 1, 2, 3].map(i => <PortalCard key={i} />)}
      </div>

      <div className="print:hidden mt-12">
        <h2 className="text-center text-base font-bold text-gray-700 uppercase tracking-wide">
          New Customer Cards
        </h2>
        <p className="text-center text-sm text-gray-500 mt-1 mb-6">
          For new customers — scan to open a wholesale account
        </p>
      </div>

      <div className="hidden print:block" style={{ pageBreakBefore: 'always' }} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-6 print:grid-cols-2 print:gap-6 print:max-w-none print:m-0">
        {[0, 1, 2, 3].map(i => <ApplyCard key={i} />)}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  )
}

function PortalCard() {
  return (
    <div
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      className="bg-white rounded-2xl overflow-hidden shadow-lg print:shadow-none print:border-2 print:border-dashed print:border-gray-300"
    >
      <div className="px-6 py-5 text-white text-center" style={{ backgroundColor: '#2c2c2c' }}>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">Welcome to</p>
        <h2 className="text-2xl font-bold tracking-tight">Stods Bakery</h2>
        <p className="text-xs opacity-75 mt-1">Toowoomba QLD</p>
      </div>

      <div className="px-6 py-5 flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">Scan to access your</p>
          <p className="text-lg font-bold" style={{ color: '#2c2c2c' }}>Customer Portal</p>
        </div>

        <div className="p-3 rounded-xl border-2" style={{ borderColor: '#2c2c2c' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PORTAL_QR} alt="Portal QR Code" width={180} height={180} className="block" />
        </div>

        <div className="w-full bg-gray-50 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
            Your portal lets you:
          </p>
          {[
            'View your invoices',
            'Check your account balance',
            'See your standing orders',
            'Download invoice PDFs',
          ].map(item => (
            <div key={item} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#2c2c2c' }}
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-gray-600">{item}</span>
            </div>
          ))}
        </div>

        <div className="w-full text-center">
          <p className="text-xs text-gray-400 mb-0.5">Or visit</p>
          <p className="text-xs font-mono font-bold" style={{ color: '#8B0000' }}>
            orders.stodsbakery.com/portal
          </p>
        </div>

        <div className="w-full grid grid-cols-3 gap-2 text-center">
          {[
            { step: '1', text: 'Scan QR code' },
            { step: '2', text: 'Check your email' },
            { step: '3', text: 'Set your password' },
          ].map(s => (
            <div key={s.step} className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center"
                style={{ backgroundColor: '#8B0000' }}
              >
                {s.step}
              </div>
              <p className="text-xs text-gray-500 leading-tight">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-3 text-center" style={{ backgroundColor: '#f8f4f0' }}>
        <p className="text-xs text-gray-500">
          Questions? Call{' '}
          <span className="font-semibold text-gray-700">07 4639 1615</span>
        </p>
      </div>
    </div>
  )
}

function ApplyCard() {
  return (
    <div
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      className="bg-white rounded-2xl overflow-hidden shadow-lg print:shadow-none print:border-2 print:border-dashed print:border-gray-300"
    >
      <div className="px-6 py-5 text-white text-center" style={{ backgroundColor: '#2c2c2c' }}>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">Open an account with</p>
        <h2 className="text-2xl font-bold tracking-tight">Stods Bakery</h2>
        <p className="text-xs opacity-75 mt-1">Toowoomba QLD</p>
      </div>

      <div className="px-6 py-5 flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">Scan to apply for a</p>
          <p className="text-lg font-bold" style={{ color: '#2c2c2c' }}>Wholesale Account</p>
        </div>

        <div className="p-3 rounded-xl border-2" style={{ borderColor: '#2c2c2c' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APPLY_QR} alt="Apply QR Code" width={180} height={180} className="block" />
        </div>

        <div className="w-full bg-gray-50 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
            A wholesale account lets you:
          </p>
          {[
            'Order fresh bread & pastries online',
            'Set up standing weekly orders',
            'Receive invoices by email',
            'Manage your account 24/7',
          ].map(item => (
            <div key={item} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#2c2c2c' }}
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-gray-600">{item}</span>
            </div>
          ))}
        </div>

        <div className="w-full text-center">
          <p className="text-xs text-gray-400 mb-0.5">Or visit</p>
          <p className="text-xs font-mono font-bold" style={{ color: '#8B0000' }}>
            orders.stodsbakery.com/register
          </p>
        </div>

        <div className="w-full grid grid-cols-4 gap-1 text-center">
          {[
            { step: '1', text: 'Scan QR code' },
            { step: '2', text: 'Fill in form' },
            { step: '3', text: 'We approve' },
            { step: '4', text: 'Start ordering' },
          ].map(s => (
            <div key={s.step} className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center"
                style={{ backgroundColor: '#8B0000' }}
              >
                {s.step}
              </div>
              <p className="text-xs text-gray-500 leading-tight">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-3 text-center" style={{ backgroundColor: '#f8f4f0' }}>
        <p className="text-xs text-gray-500">
          Questions? Call{' '}
          <span className="font-semibold text-gray-700">07 4639 1615</span>
        </p>
      </div>
    </div>
  )
}