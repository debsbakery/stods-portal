export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminOrderEditView from './admin-order-edit-view'
import { checkAdmin } from '@/lib/auth'

export default async function AdminEditOrderPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/admin')

  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        product_id,
        quantity,
        unit_price,
        subtotal,
        product_name,
        gst_applicable,
        products:product_id (
          id,
          name,
          code,
          price,
          gst_applicable
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !order) {
    redirect('/admin?error=order-not-found')
  }

  const { data: products } = await supabase
    .from('products')
    .select('id, name, code, price, gst_applicable, is_available')
    .eq('is_available', true)
    .order('code')

  return <AdminOrderEditView order={order} products={products || []} />
}