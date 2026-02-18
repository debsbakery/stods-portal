'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Package, ArrowRight } from 'lucide-react'

function OrderSuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('id')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#006A4E' }}
          >
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Order Confirmed! 🎉
          </h1>
          <p className="text-gray-600">
            Thank you for your order. We've received it successfully and will start preparing it soon.
          </p>
        </div>

        {/* Order ID */}
        {orderId && (
          <div className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Order Number</p>
                <p className="text-2xl font-mono font-bold text-gray-900">
                  {orderId.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <Package className="w-12 h-12 text-gray-400" />
            </div>
          </div>
        )}

        {/* Email Confirmation Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-blue-800">
            📧 A confirmation email has been sent to your registered email address with order details and delivery information.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/portal" className="flex-1">
            <button
              className="w-full px-6 py-3 rounded-md text-white font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
              style={{ backgroundColor: '#006A4E' }}
            >
              View Order History
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>

          <Link href="/shop" className="flex-1">
            <button
              className="w-full px-6 py-3 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 bg-white"
            >
              Continue Shopping
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>

        {/* Additional Info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>We'll prepare your order according to your delivery schedule</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>You'll receive an email notification when your order is out for delivery</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>Track your order status anytime in the customer portal</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-pulse mb-4">
              <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto"></div>
            </div>
            <p className="text-gray-500">Loading order details...</p>
          </div>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  )
}