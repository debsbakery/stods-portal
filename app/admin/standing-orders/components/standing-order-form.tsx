'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select'

interface Customer {
  id: string
  business_name: string
  email: string
  contact_name: string | null
}

interface Product {
  id: string
  code: string | null
  name: string
  price: number
  category: string | null
  is_available: boolean
}

interface ContractPrice {
  product_id: string
  contract_price: number
}

interface OrderItem {
  product_id: string
  quantity: number
  // resolved at display time
  product?: Product
  contract_price?: number | null
}

interface Props {
  customers: Customer[]
  products: Product[]
}

const WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday'
]

export default function StandingOrderForm({ customers, products }: Props) {
  const router = useRouter()

  const [customerId, setCustomerId] = useState('')
  const [deliveryDay, setDeliveryDay] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [contractPrices, setContractPrices] = useState<ContractPrice[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Build customer options
  const customerOptions: SelectOption[] = customers.map((c) => ({
    value: c.id,
    label: c.business_name || c.email,
    sublabel: c.contact_name || c.email,
  }))

  // Build product options — badge = code
  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    badge: p.code || '—',
    sublabel: formatCurrency(getEffectivePrice(p.id, p.price)),
  }))

  // When customer changes — load their contract prices
  async function handleCustomerChange(id: string) {
    setCustomerId(id)
    setItems([]) // clear items when customer changes
    setContractPrices([])

    if (!id) return

    setLoadingContracts(true)
    try {
      const res = await fetch(`/api/admin/contract-pricing?customerId=${id}`)
      const data = await res.json()
      if (data.success && data.contracts) {
        setContractPrices(
          data.contracts.map((c: any) => ({
            product_id: c.product_id,
            contract_price: c.contract_price,
          }))
        )
      }
    } catch (err) {
      console.error('Failed to load contract prices:', err)
    } finally {
      setLoadingContracts(false)
    }
  }

  // Get effective price — contract price if exists, else standard
  function getEffectivePrice(productId: string, standardPrice: number): number {
    const contract = contractPrices.find((c) => c.product_id === productId)
    return contract ? contract.contract_price : standardPrice
  }

  function getContractPrice(productId: string): number | null {
    const contract = contractPrices.find((c) => c.product_id === productId)
    return contract ? contract.contract_price : null
  }

  // Add a product line item
  function addItem(productId: string) {
    if (!productId) return
    // Don't add duplicates
    if (items.find((i) => i.product_id === productId)) return

    const product = products.find((p) => p.id === productId)
    const contractPrice = getContractPrice(productId)

    setItems((prev) => [
      ...prev,
      {
        product_id: productId,
        quantity: 1,
        product,
        contract_price: contractPrice,
      },
    ])
  }

  function updateQuantity(productId: string, qty: number) {
    if (qty < 1) return
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
    )
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  function calculateTotal(): number {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.product_id)
      if (!product) return sum
      const price = getEffectivePrice(item.product_id, product.price)
      return sum + price * item.quantity
    }, 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!customerId) { setError('Please select a customer'); return }
    if (!deliveryDay) { setError('Please select a delivery day'); return }
    if (items.length === 0) { setError('Please add at least one product'); return }

    setSubmitting(true)
    try {
const res = await fetch('/api/standing-orders', {        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          delivery_days: deliveryDay,
          active: true,
          notes: notes || null,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Already exists — offer to go edit it
        if (res.status === 409) {
          setError(`A standing order for ${deliveryDay} already exists for this customer.`)
          return
        }
        throw new Error(data.error || 'Failed to create standing order')
      }

      setSuccess(true)
      setTimeout(() => router.push('/admin/standing-orders'), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Products already in items — exclude from picker
  const availableProductOptions = productOptions.filter(
    (o) => !items.find((i) => i.product_id === o.value)
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Success */}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <p className="font-medium">Standing order created! Redirecting...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Customer */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Customer</h2>
        <SearchableSelect
          label="Select Customer"
          options={customerOptions}
          value={customerId}
          onChange={handleCustomerChange}
          placeholder="Search by business name..."
          required
        />
        {loadingContracts && (
          <p className="text-xs text-blue-600 mt-2">Loading contract prices...</p>
        )}
        {customerId && !loadingContracts && contractPrices.length > 0 && (
          <p className="text-xs text-green-600 mt-2">
            {contractPrices.length} contract price{contractPrices.length !== 1 ? 's' : ''} loaded — prices adjusted automatically
          </p>
        )}
        {customerId && !loadingContracts && contractPrices.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">
            No contract prices set — standard prices will apply
          </p>
        )}
      </div>

      {/* Delivery Day */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Delivery Day</h2>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setDeliveryDay(day)}
              className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors capitalize ${
                deliveryDay === day
                  ? 'border-green-600 bg-green-50 text-green-800'
                  : 'border-gray-200 hover:border-gray-400 text-gray-600'
              }`}
            >
              {day.slice(0, 3).charAt(0).toUpperCase() + day.slice(1, 3)}
            </button>
          ))}
        </div>
        {deliveryDay && (
          <p className="text-sm text-gray-500 mt-3">
            Delivery every <span className="font-semibold capitalize">{deliveryDay}</span>
          </p>
        )}
      </div>

      {/* Products */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Products</h2>

        {!customerId && (
          <p className="text-sm text-gray-400 mb-4">Select a customer first to see contract prices</p>
        )}

        {/* Add product picker */}
        <div className="mb-4">
          <SearchableSelect
            label="Add Product"
            options={availableProductOptions}
            value=""
            onChange={(productId) => {
              if (productId) addItem(productId)
            }}
            placeholder="Search by code or name..."
            grouped={true}
          />
        </div>

        {/* Items table */}
        {items.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Code</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Product</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Std Price</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Contract</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-600">Qty</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Subtotal</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const product = products.find((p) => p.id === item.product_id)
                  if (!product) return null
                  const contractPrice = getContractPrice(item.product_id)
                  const effectivePrice = contractPrice ?? product.price
                  const subtotal = effectivePrice * item.quantity

                  return (
                    <tr key={item.product_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                          {product.code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{product.name}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-400">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {contractPrice !== null ? (
                          <span className="font-semibold text-green-700">
                            {formatCurrency(contractPrice)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                            className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-100 font-bold text-gray-600"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(item.product_id, parseInt(e.target.value) || 1)
                            }
                            className="w-14 text-center border rounded py-1 text-sm font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                            className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-100 font-bold text-gray-600"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">
                        {formatCurrency(subtotal)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.product_id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-right text-gray-600">
                    Weekly Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lg" style={{ color: '#006A4E' }}>
                    {formatCurrency(calculateTotal())}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm">
            No products added yet — search above to add products
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 text-sm"
          placeholder="Delivery instructions, special requests..."
        />
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={submitting || success}
          className="flex-1 py-3 rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: '#006A4E' }}
        >
          {submitting ? 'Creating...' : 'Create Standing Order'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount)
}