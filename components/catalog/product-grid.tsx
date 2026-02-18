'use client'

import { useState, useEffect } from 'react'
import { ProductCard } from './product-card'
import { Button } from '@/components/ui/button'
import { Star } from 'lucide-react'

interface Product {
  id: string
  product_number: number | null
  name: string
  description: string | null
  price: string
  unit_price?: string
  image_url: string | null
  category: string | null
  available: boolean
}

export function ProductGrid({ initialProducts, customerId }: { 
  initialProducts: Product[]
  customerId: string 
}) {
  const [products, setProducts] = useState(initialProducts)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadFavorites()
  }, [])

  const loadFavorites = async () => {
    try {
      const res = await fetch('/api/shadow-orders')
      if (res.ok) {
        const data = await res.json()
        setFavoriteIds(new Set(data.map((fav: any) => fav.products.id)))
      }
    } catch (error) {
      console.error('Failed to load favorites:', error)
    }
  }

  const toggleFavorite = async (productId: string) => {
    setLoading(true)
    try {
      if (favoriteIds.has(productId)) {
        // Remove from favorites
        const fav = await fetch('/api/shadow-orders').then(r => r.json())
        const toRemove = fav.find((f: any) => f.products.id === productId)
        
        if (toRemove) {
          await fetch(`/api/shadow-orders?id=${toRemove.id}`, {
            method: 'DELETE'
          })
        }
      } else {
        // Add to favorites
        await fetch('/api/shadow-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: productId,
            default_quantity: 1
          })
        })
      }

      await loadFavorites()
    } catch (error) {
      console.error('Toggle favorite error:', error)
      alert('Failed to update favorites')
    } finally {
      setLoading(false)
    }
  }

  const displayedProducts = showFavoritesOnly
    ? products.filter(p => favoriteIds.has(p.id))
    : products

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {showFavoritesOnly ? 'My Favorite Products' : 'All Products'}
        </h2>

        <Button
          variant={showFavoritesOnly ? 'default' : 'outline'}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className="gap-2"
        >
          <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-yellow-500 text-yellow-500' : ''}`} />
          {showFavoritesOnly ? 'Show All Products' : 'Show My Usual'}
        </Button>
      </div>

      {displayedProducts.length === 0 ? (
        <div className="text-center py-12">
          <Star className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold mb-2">No favorite products yet</h3>
          <p className="text-gray-600 mb-4">
            Click the star icon on any product to add it to your favorites
          </p>
          <Button onClick={() => setShowFavoritesOnly(false)}>
            Browse All Products
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayedProducts.map(product => (
            <div key={product.id} className="relative">
              <button
                onClick={() => toggleFavorite(product.id)}
                disabled={loading}
                className="absolute top-2 right-2 z-10 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition"
                aria-label={favoriteIds.has(product.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star
                  className={`w-5 h-5 ${
                    favoriteIds.has(product.id)
                      ? 'fill-yellow-500 text-yellow-500'
                      : 'text-gray-400'
                  }`}
                />
              </button>
              
              <ProductCard
                product={{
                  ...product,
                  price: parseFloat(product.price?.toString() || '0'),
                }}
                customerId={customerId}
                onAddToCart={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}