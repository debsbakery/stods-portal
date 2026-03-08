import { createAdminClient } from '@/lib/supabase/admin'
import StatementsView from './statements-view'

export default async function StatementsPage() {
  const supabase = createAdminClient()

  // customers.balance is maintained by DB triggers on payments + ar_transactions
  // It is the source of truth — do not recalculate
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, balance, payment_terms, address')
    .order('business_name', { ascending: true })

  if (!customers || customers.length === 0) {
    return <StatementsView customers={[]} customersWithBalance={[]} />
  }

  // Use trigger-maintained balance directly — no recalculation
  const customersWithBalance = customers
    .map(c => ({ ...c, balance: Number(c.balance ?? 0) }))
    .filter(c => c.balance > 0.01)

  return (
    <StatementsView
      customers={customers.map(c => ({ ...c, balance: Number(c.balance ?? 0) }))}
      customersWithBalance={customersWithBalance}
    />
  )
}