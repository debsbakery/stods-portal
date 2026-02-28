export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { ArrowLeft } from 'lucide-react'
import StandingOrderForm from '../components/standing-order-form'

async function getFormData() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const [{ data: customers }, { data: products }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, business_name, email, contact_name')
      .order('business_name'),
    supabase
      .from('products')
      .select('id, code, name, price, category, is_available')
      .eq('is_available', true)
      .order('code', { ascending: true, nullsFirst: false }),
  ])

  return {
    customers: customers || [],
    products: products || [],
  }
}

export default async function CreateStandingOrderPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const { customers, products } = await getFormData()

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <a
        href="/admin/standing-orders"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Standing Orders
      </a>
      <h1 className="text-3xl font-bold mb-1">Create Standing Order</h1>
      <p className="text-gray-500 mb-8">Set up a recurring weekly order for a customer</p>

      <StandingOrderForm
        customers={customers}
        products={products}
      />
    </div>
  )
}