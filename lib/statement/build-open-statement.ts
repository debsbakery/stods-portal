import { createAdminClient } from '@/lib/supabase/admin'

// ---- Types (match lib/pdf/open-invoices.ts) ----

export interface OpenInvoice {
  date: string
  due_date: string | null
  reference: string
  invoice_number?: number | null
  description: string
  amount: number
  amount_paid: number
  outstanding: number
  status: 'unpaid' | 'partial' | 'paid'
}

export interface PaymentLine {
  date: string
  reference: string | null
  method: string
  amount: number
}

export interface AgeingBucket {
  label: string
  amount: number
}

export interface OpenStatementData {
  customer: {
    business_name?: string
    contact_name?: string
    email?: string
    address?: string
    payment_terms?: string
  }
  invoices: OpenInvoice[]
  totalOutstanding: number
  customerBalance?: number
  asAt: string
  // new fields for step 2
  payments: PaymentLine[]
  periodStart: string      // 1st of month of oldest unpaid invoice
  ageing: AgeingBucket[]   // Current / 14 / 30 / 60 / 90+
}

const round2 = (n: number) => Math.round(n * 100) / 100
const toDateStr = (d: Date) => d.toISOString().slice(0, 10)

export async function buildOpenStatement(customerId: string): Promise<OpenStatementData> {
  const supabase = createAdminClient()
  const today = new Date()

  // ---- 1. Customer ----
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, email, address, payment_terms, balance')
    .eq('id', customerId)
    .single()

  if (custErr || !customer) throw new Error(`Customer not found: ${customerId}`)

  // ---- 2. Unpaid invoices (oldest first) ----
  const { data: txns, error: txnErr } = await supabase
    .from('ar_transactions')
    .select('id, type, amount, amount_paid, description, invoice_id, due_date, created_at')
    .eq('customer_id', customerId)
    .eq('type', 'invoice')
    .order('created_at', { ascending: true })

  if (txnErr) throw new Error(`Failed to fetch ar_transactions: ${txnErr.message}`)

  const unpaid = (txns ?? []).filter(
    (t) => round2(t.amount - (t.amount_paid ?? 0)) > 0.01
  )

    // ---- 3. Invoice number lookup: invoice_numbers table first, orders fallback ----
  const invoiceIds = unpaid.filter((t) => t.invoice_id).map((t) => t.invoice_id as string)

  const invoiceMap: Record<string, string> = {}
  if (invoiceIds.length > 0) {
    const { data: invNums } = await supabase
      .from('invoice_numbers')
      .select('order_id, invoice_number')
      .in('order_id', invoiceIds)
    for (const inv of invNums ?? []) {
      if (inv.order_id) invoiceMap[inv.order_id] = String(inv.invoice_number)
    }
    // Fallback to orders table
    const missing = invoiceIds.filter((id) => !invoiceMap[id])
    if (missing.length > 0) {
      const { data: ordersWithInv } = await supabase
        .from('orders')
        .select('id, invoice_number')
        .in('id', missing)
      for (const o of ordersWithInv ?? []) {
        if (o.invoice_number) invoiceMap[o.id] = String(o.invoice_number)
      }
    }
  }

  const invoices: OpenInvoice[] = unpaid.map((t) => {
    const amount = Number(t.amount)
    const paid = Number(t.amount_paid ?? 0)
    const invoiceNum = t.invoice_id ? invoiceMap[t.invoice_id] ?? null : null
    const reference = invoiceNum
      ? `INV-${String(invoiceNum).padStart(4, '0')}`
      : 'INVOICE'

    return {
      date: t.created_at,
      due_date: t.due_date ?? null,
      reference,
      invoice_number: invoiceNum ? Number(invoiceNum) : null,
      description: t.description || reference,
      amount: round2(amount),
      amount_paid: round2(paid),
      outstanding: round2(Math.max(amount - paid, 0)),
      status: paid > 0.01 ? 'partial' : 'unpaid',
    }
  })
  const totalOutstanding = round2(invoices.reduce((s, i) => s + i.outstanding, 0))
  // ---- 4. Period start = 1st of month of oldest unpaid invoice ----
  const anchor = unpaid.length ? new Date(unpaid[0].created_at) : today
  const periodStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const periodStartStr = toDateStr(periodStart)

  // ---- 5. Payments from period start (payments table — NOT ar_transactions) ----
  const { data: pmts, error: pmtErr } = await supabase
    .from('payments')
    .select('payment_date, payment_method, reference_number, amount')
    .eq('customer_id', customerId)
    .gte('payment_date', periodStartStr)
    .order('payment_date', { ascending: true })

  if (pmtErr) throw new Error(`Failed to fetch payments: ${pmtErr.message}`)

  const payments: PaymentLine[] = (pmts ?? []).map((p) => ({
    date: p.payment_date,
    reference: p.reference_number ?? null,
    method: p.payment_method ?? 'bank_transfer',
    amount: round2(p.amount),
  }))

  // ---- 6. Ageing buckets by INVOICE DATE: 0–14 / 15–30 / 31–60 / 61–90 / 90+ ----
  const buckets = { current: 0, d14: 0, d30: 0, d60: 0, d90plus: 0 }

  for (const inv of invoices) {
        const age = Math.floor(
      (today.getTime() - new Date(inv.date).getTime()) / 86400000
    )
    if (age <= 14) buckets.current += inv.outstanding
    else if (age <= 30) buckets.d14 += inv.outstanding
    else if (age <= 60) buckets.d30 += inv.outstanding
    else if (age <= 90) buckets.d60 += inv.outstanding
    else buckets.d90plus += inv.outstanding
  }

  const ageing: AgeingBucket[] = [
    { label: 'Current',  amount: round2(buckets.current) },
    { label: '14 Days',  amount: round2(buckets.d14) },
    { label: '30 Days',  amount: round2(buckets.d30) },
    { label: '60 Days',  amount: round2(buckets.d60) },
    { label: '90+ Days', amount: round2(buckets.d90plus) },
  ]

  return {
    customer: {
      business_name: customer.business_name ?? undefined,
      contact_name: customer.contact_name ?? undefined,
      email: customer.email ?? undefined,
      address: customer.address ?? undefined,
      payment_terms: customer.payment_terms ? `${customer.payment_terms} days` : '30 days',
    },
    invoices,
    totalOutstanding,
    customerBalance: customer.balance ?? 0,
    asAt: toDateStr(today),
    payments,
    periodStart: periodStartStr,
    ageing,
  }
}