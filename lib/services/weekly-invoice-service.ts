// lib/services/weekly-invoice-service.ts
//
// Single source of truth for weekly invoice generation.
// Used by the admin manual-trigger endpoint, and (Phase 2c) the Sunday cron.

import { createAdminClient } from '@/lib/supabase/admin'

export interface WeeklyInvoiceResult {
  success:        boolean
  weekly_invoice_id?: string
  invoice_number?:    number
  customer_id:    string
  week_start:     string
  week_end:       string
  order_count:    number
  total_amount:   number
  gst_amount:     number
  message:        string
  was_revised:    boolean
}

/**
 * Get the Sunday-Saturday week range for a given anchor date.
 * Anchor is typically "today" (= the issue day, which is Sunday).
 * Returns the PREVIOUS week (Sun–Sat) — the one we're invoicing for.
 */
export function getPreviousWeekRange(anchor: Date = new Date()): { start: string; end: string } {
  // Convert to Brisbane time so we get the right "today"
  const brisbane = new Date(
    anchor.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' })
  )
  brisbane.setHours(0, 0, 0, 0)

  const dayOfWeek = brisbane.getDay() // 0=Sun

  // The Sunday that just passed (or today if today is Sunday) is the start of THIS week.
  // We want the PREVIOUS week — so go back 7 days from there.
  const thisWeekStart = new Date(brisbane)
  thisWeekStart.setDate(brisbane.getDate() - dayOfWeek)

  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setDate(thisWeekStart.getDate() - 7)

  const prevWeekEnd = new Date(prevWeekStart)
  prevWeekEnd.setDate(prevWeekStart.getDate() + 6)

  return {
    start: prevWeekStart.toISOString().split('T')[0],
    end:   prevWeekEnd.toISOString().split('T')[0],
  }
}

/**
 * Get next available invoice number (shared sequence with daily orders).
 */
async function getNextInvoiceNumber(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: maxOrder } = await supabase
    .from('orders')
    .select('invoice_number')
    .not('invoice_number', 'is', null)
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: maxWeekly } = await supabase
    .from('weekly_invoices')
    .select('invoice_number')
    .not('invoice_number', 'is', null)
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const max = Math.max(
    Number(maxOrder?.invoice_number ?? 0),
    Number(maxWeekly?.invoice_number ?? 0),
  )
  return max + 1
}

/**
 * Generate (or regenerate) a weekly invoice for a single customer + week.
 * Idempotent: if a weekly_invoice already exists for that customer+week,
 * it will be UPDATED with revised totals (status: 'revised') rather than duplicated.
 */
export async function generateWeeklyInvoice(
  customerId: string,
  weekStart:  string,   // YYYY-MM-DD (must be a Sunday)
  weekEnd:    string,   // YYYY-MM-DD (must be a Saturday)
): Promise<WeeklyInvoiceResult> {
  const supabase = createAdminClient()

  // ── 1. Validate customer ─────────────────────────────────────────────────
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, business_name, payment_terms, invoice_frequency, invoice_brand')
    .eq('id', customerId)
    .single()

  if (cErr || !customer) {
    throw new Error(`Customer ${customerId} not found`)
  }
  if (customer.invoice_frequency !== 'weekly') {
    throw new Error(
      `Customer "${customer.business_name}" is set to '${customer.invoice_frequency}' billing — must be 'weekly' to generate a weekly invoice.`
    )
  }

  // ── 2. Find all orders in the week range that aren't cancelled ──────────
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, delivery_date, total_amount, status, weekly_invoice_id')
    .eq('customer_id', customerId)
    .gte('delivery_date', weekStart)
    .lte('delivery_date', weekEnd)
    .neq('status', 'cancelled')
    .order('delivery_date', { ascending: true })

  if (oErr) throw new Error(oErr.message)

  if (!orders || orders.length === 0) {
    return {
      success:      false,
      customer_id:  customerId,
      week_start:   weekStart,
      week_end:     weekEnd,
      order_count:  0,
      total_amount: 0,
      gst_amount:   0,
      message:      'No deliveries this week — invoice skipped.',
      was_revised:  false,
    }
  }

  // ── 3. Sum totals (already include GST in orders.total_amount) ──────────
  const totalAmount = Math.round(
    orders.reduce((s, o) => s + Number(o.total_amount || 0), 0) * 100
  ) / 100

  // ── 4. Compute GST portion from line items ──────────────────────────────
  const orderIds = orders.map(o => o.id)
  const { data: lineItems } = await supabase
    .from('order_items')
    .select('order_id, subtotal, gst_applicable')
    .in('order_id', orderIds)

  const gstAmount = Math.round(
    (lineItems ?? []).reduce(
      (s, li: any) => s + (li.gst_applicable ? Number(li.subtotal || 0) * 0.1 : 0), 0
    ) * 100
  ) / 100

  // ── 5. Calculate due date ───────────────────────────────────────────────
  const dueDate = new Date(weekEnd)
  dueDate.setDate(dueDate.getDate() + (customer.payment_terms ?? 14))
  const dueDateStr = dueDate.toISOString().split('T')[0]

  // ── 6. Check if a weekly invoice already exists for this customer+week ─
  const { data: existing } = await supabase
    .from('weekly_invoices')
    .select('id, invoice_number, status')
    .eq('customer_id', customerId)
    .eq('week_start',  weekStart)
    .maybeSingle()

  let weeklyId: string
  let invoiceNumber: number
  let wasRevised = false

  if (existing) {
    // ── REGENERATE: update existing ───────────────────────────────────────
    wasRevised    = true
    weeklyId      = existing.id
    invoiceNumber = existing.invoice_number ?? 0

    const { error: updErr } = await supabase
      .from('weekly_invoices')
      .update({
        total_amount:   totalAmount,
        gst_amount:     gstAmount,
        status:         'revised',
        revised_at:     new Date().toISOString(),
        due_date:       dueDateStr,
        invoice_brand:  customer.invoice_brand ?? null,
      })
      .eq('id', existing.id)

    if (updErr) throw new Error(updErr.message)

    // Wipe + re-insert order links (in case orders changed since last run)
    await supabase
      .from('weekly_invoice_orders')
      .delete()
      .eq('weekly_invoice_id', existing.id)

  } else {
    // ── CREATE: brand new weekly invoice ──────────────────────────────────
    invoiceNumber = await getNextInvoiceNumber(supabase)

    const { data: created, error: insErr } = await supabase
      .from('weekly_invoices')
      .insert({
        customer_id:    customerId,
        week_start:     weekStart,
        week_end:       weekEnd,
        invoice_number: invoiceNumber,
        total_amount:   totalAmount,
        gst_amount:     gstAmount,
        status:         'issued',
        issued_at:      new Date().toISOString(),
        due_date:       dueDateStr,
        invoice_brand:  customer.invoice_brand ?? null,
      })
      .select('id')
      .single()

    if (insErr || !created) throw new Error(insErr?.message ?? 'Failed to create weekly invoice')
    weeklyId = created.id
  }

  // ── 7. Link orders to weekly invoice ────────────────────────────────────
  const links = orderIds.map(oid => ({
    weekly_invoice_id: weeklyId,
    order_id:          oid,
  }))

  const { error: linkErr } = await supabase
    .from('weekly_invoice_orders')
    .insert(links)

  if (linkErr) throw new Error(linkErr.message)

  // ── 8. Stamp orders with weekly_invoice_id ──────────────────────────────
  await supabase
    .from('orders')
    .update({ weekly_invoice_id: weeklyId })
    .in('id', orderIds)

  // ── 9. Sync ar_transactions (one row for the weekly invoice) ───────────
  // Remove any prior weekly tx for this same weekly_invoice_id (idempotent)
  await supabase
    .from('ar_transactions')
    .delete()
    .eq('description', `weekly:${weeklyId}`)

  await supabase
    .from('ar_transactions')
    .insert({
      customer_id:  customerId,
      type:         'invoice',
      amount:       totalAmount,
      due_date:     dueDateStr,
      description:  `weekly:${weeklyId}`,
      created_at:   new Date().toISOString(),
    })

  // ── 10. Recalculate customer balance ────────────────────────────────────
  const { data: allTx } = await supabase
    .from('ar_transactions')
    .select('type, amount, amount_paid')
    .eq('customer_id', customerId)

  const newBalance = Math.round(
    (allTx ?? []).reduce((sum, tx: any) => {
      const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
      if (tx.type === 'invoice') return sum + owed
      if (tx.type === 'payment') return sum - Number(tx.amount)
      if (tx.type === 'credit')  return sum - owed
      return sum
    }, 0) * 100
  ) / 100

  await supabase
    .from('customers')
    .update({ balance: newBalance })
    .eq('id', customerId)

  return {
    success:           true,
    weekly_invoice_id: weeklyId,
    invoice_number:    invoiceNumber,
    customer_id:       customerId,
    week_start:        weekStart,
    week_end:          weekEnd,
    order_count:       orders.length,
    total_amount:      totalAmount,
    gst_amount:        gstAmount,
    message:           wasRevised
      ? `Weekly invoice #${invoiceNumber} REVISED (${orders.length} orders, $${totalAmount.toFixed(2)})`
      : `Weekly invoice #${invoiceNumber} CREATED (${orders.length} orders, $${totalAmount.toFixed(2)})`,
    was_revised:       wasRevised,
  }
}