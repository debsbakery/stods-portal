import { createAdminClient } from '@/lib/supabase/admin'
import StatementsView from './statements-view'

export default async function StatementsPage() {
  const supabase = createAdminClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, balance, payment_terms, address')
    .order('business_name', { ascending: true })

  if (!customers || customers.length === 0) {
    return <StatementsView customers={[]} customersWithBalance={[]} />
  }

  // Pull all ar_transactions to recalculate live balance
  // Invoices are stored as POSITIVE, payments as POSITIVE but subtracted
  // We need to read the balance_after of the latest transaction per customer
  // OR recalculate: sum of invoice amounts minus sum of payment amounts

  const { data: invoiceTxns } = await supabase
    .from('ar_transactions')
    .select('customer_id, amount')
    .eq('type', 'invoice')

  const { data: paymentTxns } = await supabase
    .from('ar_transactions')
    .select('customer_id, amount')
    .eq('type', 'payment')

  // Build invoice totals per customer
  const invoiceMap: Record<string, number> = {}
  for (const txn of invoiceTxns ?? []) {
    invoiceMap[txn.customer_id] = (invoiceMap[txn.customer_id] ?? 0) + Number(txn.amount)
  }

  // Build payment totals per customer
  const paymentMap: Record<string, number> = {}
  for (const txn of paymentTxns ?? []) {
    paymentMap[txn.customer_id] = (paymentMap[txn.customer_id] ?? 0) + Number(txn.amount)
  }

  // Live balance = invoices - payments
  const customersWithLiveBalance = customers.map(c => ({
    ...c,
    balance: Number(
      ((invoiceMap[c.id] ?? 0) - (paymentMap[c.id] ?? 0)).toFixed(2)
    ),
  }))

  const withBalance = customersWithLiveBalance.filter(c => c.balance > 0.01)

  return (
    <StatementsView
      customers={customersWithLiveBalance}
      customersWithBalance={withBalance}
    />
  )
}