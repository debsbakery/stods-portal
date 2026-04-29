'use client'

import { useEffect, useState } from 'react'

/**
 * React hook that tracks cart count from localStorage.
 * Updates automatically when cart changes (cross-tab + same-tab).
 */
export function useCartCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    function readCart() {
      try {
        const saved = localStorage.getItem('cart')
        if (!saved) {
          setCount(0)
          return
        }
        const items: any[] = JSON.parse(saved)
        const total = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)
        setCount(total)
      } catch {
        setCount(0)
      }
    }

    // Initial read
    readCart()

    // Listen to cart changes from this tab (custom event)
    const onCartChanged = () => readCart()
    window.addEventListener('cart-changed', onCartChanged)

    // Listen to cart changes from other tabs (storage event)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cart') readCart()
    }
    window.addEventListener('storage', onStorage)

    // Poll occasionally as a safety net (in case someone updates cart without firing event)
    const interval = setInterval(readCart, 3000)

    return () => {
      window.removeEventListener('cart-changed', onCartChanged)
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [])

  return count
}

/**
 * Helper to call when cart is updated.
 * Triggers the useCartCount hook to re-read.
 */
export function notifyCartChanged() {
  window.dispatchEvent(new Event('cart-changed'))
}