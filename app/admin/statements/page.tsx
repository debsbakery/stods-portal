import { createAdminClient } from '@/lib/supabase/admin'
import StatementsView from './statements-view'

export default async function StatementsPage() {
  const supabase = createAdminClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, balance, payment_terms, address')
    .order('business_name', { ascending: true })

  // Customers with outstanding balances
  const withBalance = (customers ?? []).filter(c => parseFloat(c.balance || '0') > 0)

  return (
    <StatementsView
      customers={customers ?? []}
      customersWithBalance={withBalance}
    />
  )
}