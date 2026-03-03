export const dynamic = 'force-dynamic'

import { ArrowLeft, Printer } from 'lucide-react'
import Link from 'next/link'

export default function PortalQRPage() {
  const portalUrl = 'https://debsbakery-portal.vercel.app/portal'

  // QR code via Google Charts API — no login, no package needed
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(portalUrl)}&margin=10&color=006A4E`

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      {/* Admin controls — hidden when printing */}
      <div className="print:hidden mb-6 flex items-center justify-between max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm hover:opacity-80"
          style={{ color: '#CE1126' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold hover:opacity-90"
          style={{ backgroundColor: '#006A4E' }}
        >
          <Printer className="h-4 w-4" /> Print Cards
        </button>
      </div>

      <p className="print:hidden text-center text-sm text-gray-500 mb-8">
        Print this page — cut along the dotted lines to hand to customers
      </p>

      {/* Print grid — 2 cards per row, 4 per page */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto print:grid-cols-2 print:gap-4 print:max-w-none print:m-0">
        {[...Array(4)].map((_, i) => (
          <Card key={i} qrUrl={qrUrl} portalUrl={portalUrl} />
        ))}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  )
}

function Card({ qrUrl, portalUrl }: { qrUrl: string; portalUrl: string }) {
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-lg print:shadow-none print:border-2 print:border-dashed print:border-gray-300"
      style={{ breakInside: 'avoid' }}
    >
      {/* Green header */}
      <div
        className="px-6 py-5 text-white text-center"
        style={{ backgroundColor: '#006A4E' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">
          Welcome to
        </p>
        <h2 className="text-2xl font-bold tracking-tight">
          {"Deb's Bakery"}
        </h2>
        <p className="text-xs opacity-75 mt-1">
          Toowoomba QLD
        </p>
      </div>

      {/* Body */}
      <div className="px-6 py-5 flex flex-col items-center gap-4">

        {/* Instruction */}
        <p className="text-center text-sm font-semibold text-gray-700">
          Scan to access your
        </p>
        <p
          className="text-center text-lg font-bold -mt-3"
          style={{ color: '#006A4E' }}
        >
          Customer Portal
        </p>

        {/* QR Code */}
        <div
          className="p-3 rounded-xl border-2"
          style={{ borderColor: '#006A4E' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Portal QR Code"
            width={180}
            height={180}
            className="block"
          />
        </div>

        {/* What they can do */}
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
                style={{ backgroundColor: '#006A4E' }}
              >
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-gray-600">{item}</span>
            </div>
          ))}
        </div>

        {/* URL */}
        <div className="w-full text-center">
          <p className="text-xs text-gray-400 mb-0.5">Or visit</p>
          <p
            className="text-xs font-mono font-bold break-all"
            style={{ color: '#CE1126' }}
          >
            debsbakery-portal.vercel.app/portal
          </p>
        </div>

        {/* Steps */}
        <div className="w-full grid grid-cols-3 gap-2 text-center">
          {[
            { step: '1', text: 'Scan QR code' },
            { step: '2', text: 'Check your email' },
            { step: '3', text: 'Set your password' },
          ].map(s => (
            <div key={s.step} className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center"
                style={{ backgroundColor: '#CE1126' }}
              >
                {s.step}
              </div>
              <p className="text-xs text-gray-500 leading-tight">{s.text}</p>
            </div>
          ))}
        </div>

      </div>

      {/* Footer */}
      <div
        className="px-6 py-3 text-center"
        style={{ backgroundColor: '#f8f4f0' }}
      >
        <p className="text-xs text-gray-500">
          Questions? Call us on{' '}
          <span className="font-semibold text-gray-700">(07) 4632 9475</span>
        </p>
      </div>
    </div>
  )
}