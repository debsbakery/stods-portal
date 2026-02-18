export const dynamic = 'force-dynamic' 
import { createClient } from '@/lib/supabase/server'
import { ContractPricingManager } from '@/components/admin/contract-pricing-manager'

export default async function PricingPage() {
  const supabase = await createClient()

  // Get all customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email')
    .order('business_name', { ascending: true, nullsFirst: false })

  // Get all products
  const { data: products } = await supabase
  .from('products')
  .select('id, product_number, name, price')
  .eq('is_available', true)
  .order('product_number', { ascending: true, nullsFirst: false })
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Contract Pricing Management</h1>
      <ContractPricingManager 
        customers={customers || []} 
        products={products || []} 
      />
    </div>
  )
}