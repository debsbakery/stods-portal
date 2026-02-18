import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Image from 'next/image'
import { getCustomerPrice } from '@/lib/services/pricing-service'

interface Product {
  id: string
  product_number: number | null
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  available: boolean
}

interface ProductCardProps {
  product: Product
  customerId: string
  onAddToCart: (product: Product, price: number) => void
}

export async function ProductCard({ product, customerId, onAddToCart }: ProductCardProps) {
  const pricing = await getCustomerPrice(customerId, product.id)

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-square relative bg-gray-100">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-6xl">🍞</span>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <div className="mb-2">
          {product.product_number && (
            <span className="text-xs font-mono text-gray-500">
              #{product.product_number}
            </span>
          )}
          <h3 className="font-semibold text-lg">{product.name}</h3>
        </div>

        {product.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          {pricing.isContractPrice ? (
            <div className="text-xl font-bold text-blue-600">
              {formatCurrency(pricing.price)}
            </div>
          ) : (
            <div className="text-xl font-bold">
              {formatCurrency(pricing.price)}
            </div>
          )}

          <Button
            onClick={() => onAddToCart(product, pricing.price)}
            disabled={!product.available}
            size="sm"
          >
            {product.available ? 'Add to Cart' : 'Out of Stock'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}