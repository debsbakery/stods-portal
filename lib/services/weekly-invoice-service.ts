// lib/services/weekly-invoice-service.ts
//
// Single source of truth for weekly invoice generation.
// Used by the admin manual-trigger endpoint, and the Sunday cron.

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
 */
export function getPreviousWeekRange(anchor: Date = new Date()): { start: string; end: string } {
  const brisbane = new Date(
    anchor.toLocaleString('en-US', { timeZone: 'Australia/Perth' })
  )
  brisbane.setHours(0, 0, 0, 0)

  const dayOfWeek = brisbane.getDay()

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
  weekStart:  string,
  weekEnd:    string,
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
   // ── 2. Find orders in the week range ────────────────────────────────────
  // On first run: only grab orders that are NOT already invoiced individually
  // On revision: also include orders already linked to THIS weekly invoice
  const { data: allWeekOrders, error: oErr } = await supabase
    .from('orders')
    .select('id, delivery_date, total_amount, status, weekly_invoice_id')
    .eq('customer_id', customerId)
    .gte('delivery_date', weekStart)
    .lte('delivery_date', weekEnd)
    .neq('status', 'cancelled')
    .order('delivery_date', { ascending: true })

    if (oErr) throw new Error(oErr.message)

  // Check if a weekly invoice already exists for this customer+week (needed for filter)
  const { data: existing } = await supabase
    .from('weekly_invoices')
    .select('id, invoice_number, status')
    .eq('customer_id', customerId)
    .eq('week_start',  weekStart)
    .maybeSingle()

  // Filter: include orders that are pending/confirmed OR already part of this weekly invoice
  const orders = (allWeekOrders ?? []).filter(o => {
    // Already linked to this weekly invoice (revision) — always include
    if (existing && o.weekly_invoice_id === existing.id) return true
    // Already invoiced individually — skip (don't double-count)
    if (o.status === 'invoiced' && !o.weekly_invoice_id) return false
    // Pending/confirmed — include
    return true
   })

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

  // ── 3. Sum totals ──────────────────────────────────────────────────────
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

 
  let weeklyId: string
  let invoiceNumber: number
  let wasRevised = false

  if (existing) {
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

    await supabase
      .from('weekly_invoice_orders')
      .delete()
      .eq('weekly_invoice_id', existing.id)

  } else {
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

  // ── 8. Stamp orders with weekly_invoice_id + mark as invoiced ──────────
  await supabase
    .from('orders')
    .update({
      weekly_invoice_id: weeklyId,
      status:            'invoiced',
      invoiced_at:       new Date().toISOString(),
      
    })
    .in('id', orderIds)

    // ── 9. Sync ar_transactions (one row for the weekly invoice) ───────────
  // Delete ANY prior weekly invoice AR entries for this weekly invoice
  // Match on weekly_invoice_id OR on the description pattern
  const weeklyInvDesc = `Weekly Invoice #${invoiceNumber}`

  await supabase
    .from('ar_transactions')
    .delete()
    .eq('customer_id', customerId)
    .eq('description', weeklyInvDesc)

  await supabase
    .from('ar_transactions')
    .insert({
      customer_id:  customerId,
      type:         'invoice',
      amount:       totalAmount,
      due_date:     dueDateStr,
      description:  weeklyInvDesc,
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


export function buildDayLines(
  orders: Array<{ id: string; delivery_date: string; invoice_number: number | null; total_amount: number }>,
  itemsByOrderId: Map<string, Array<{
    product_name: string
    custom_description: string | null
    quantity: number
    unit_price: number
    subtotal: number
    gst_applicable: boolean
  }>>
) {
  // Group orders by delivery_date
  const dayMap = new Map<string, {
    delivery_date: string
    total_amount: number
    orders: Array<{
      order_id: string
      invoice_number: number | null
      total_amount: number
      items: Array<{
        product_name: string
        custom_description: string | null
        quantity: number
        unit_price: number
        subtotal: number
        gst_applicable: boolean
      }>
    }>
  }>()

  for (const o of orders) {
    const date = o.delivery_date
    if (!dayMap.has(date)) {
      dayMap.set(date, {
        delivery_date: date,
        total_amount: 0,
        orders: [],
      })
    }
    const day = dayMap.get(date)!
    day.total_amount = Math.round((day.total_amount + Number(o.total_amount || 0)) * 100) / 100
    day.orders.push({
      order_id:       o.id,
      invoice_number: o.invoice_number,
      total_amount:   Number(o.total_amount || 0),
      items:          itemsByOrderId.get(o.id) ?? [],
    })
  }

  // Return sorted by date
  return Array.from(dayMap.values()).sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
}


/**
 * Send a weekly invoice email with PDF attachment.
 */
export async function sendWeeklyInvoiceEmail(weeklyInvoiceId: string) {
  const { Resend } = await import('resend')
  const { generateWeeklyInvoicePDF } = await import('@/lib/pdf/weekly-invoice-pdf')
  type OrderLineItem = import('@/lib/pdf/weekly-invoice-pdf').OrderLineItem
  type DayGroup = import('@/lib/pdf/weekly-invoice-pdf').DayGroup

  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createAdminClient()

  // 1. Fetch weekly invoice + customer
  const { data: weekly, error: wErr } = await supabase
    .from('weekly_invoices')
    .select(`*, customer:customers ( business_name, email, address, phone, abn )`)
    .eq('id', weeklyInvoiceId)
    .single()

  if (wErr || !weekly) throw new Error(`Weekly invoice ${weeklyInvoiceId} not found`)
  if (!weekly.customer?.email) throw new Error(`No email for customer on weekly invoice ${weeklyInvoiceId}`)

  // 2. Fetch linked order IDs
  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', weeklyInvoiceId)

  const orderIds = (links ?? []).map((l: any) => l.order_id)

  // 3. Fetch orders (need delivery_date + total for grouping)
  const { data: orders } = await supabase
    .from('orders')
    .select('id, delivery_date, total_amount')
    .in('id', orderIds)
    .order('delivery_date', { ascending: true })

  // 4. Fetch all order items
  const { data: allItems } = await supabase
    .from('order_items')
    .select('order_id, product_name, custom_description, quantity, unit_price, subtotal, gst_applicable')
    .in('order_id', orderIds)
    .order('product_name', { ascending: true })

  // Group items by order_id
  const itemsByOrderId = new Map<string, OrderLineItem[]>()
  for (const item of (allItems ?? [])) {
    const oid = item.order_id as string
    if (!itemsByOrderId.has(oid)) itemsByOrderId.set(oid, [])
    itemsByOrderId.get(oid)!.push({
      product_name:       item.product_name as string,
      custom_description: item.custom_description as string | null,
      quantity:           Number(item.quantity),
      unit_price:         Number(item.unit_price),
      subtotal:           Number(item.subtotal),
      gst_applicable:     item.gst_applicable as boolean,
    })
  }

  // 5. Group by delivery date
  const dayMap = new Map<string, { items: OrderLineItem[]; total: number }>()
  for (const o of (orders ?? [])) {
    const date = o.delivery_date
    if (!dayMap.has(date)) dayMap.set(date, { items: [], total: 0 })
    const day = dayMap.get(date)!
    day.total = Math.round((day.total + Number(o.total_amount || 0)) * 100) / 100
    day.items.push(...(itemsByOrderId.get(o.id) ?? []))
  }

  const days: DayGroup[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      delivery_date: date,
      items:         data.items,
      day_total:     data.total,
    }))

  // 6. Bakery details
  const bakery = {
    name:        process.env.RESEND_FROM_NAME ?? 'Norbake',
    email:       process.env.RESEND_FROM_EMAIL ?? 'orders@norbakebroome.com',
    phone:       process.env.NEXT_PUBLIC_BAKERY_PHONE   ?? '',
    address:     process.env.NEXT_PUBLIC_BAKERY_ADDRESS ?? '',
    abn:         process.env.NEXT_PUBLIC_BAKERY_ABN     ?? '',
    bankName:    process.env.NEXT_PUBLIC_BANK_NAME      ?? '',
    bankBSB:     process.env.NEXT_PUBLIC_BANK_BSB       ?? '',
    bankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT   ?? '',
  }

  // 7. Generate PDF
  const pdf = await generateWeeklyInvoicePDF({
    weekly: {
      id:             weekly.id,
      invoice_number: weekly.invoice_number,
      week_start:     weekly.week_start,
      week_end:       weekly.week_end,
      total_amount:   Number(weekly.total_amount),
      gst_amount:     Number(weekly.gst_amount),
      issued_at:      weekly.issued_at,
      revised_at:     weekly.revised_at,
      due_date:       weekly.due_date,
      status:         weekly.status,
    },
    customer: {
      business_name: weekly.customer?.business_name ?? '',
      email:         weekly.customer?.email         ?? '',
      address:       weekly.customer?.address,
      phone:         weekly.customer?.phone,
      abn:           weekly.customer?.abn,
    },
    days,
    bakery,
  })

  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  const filename  = `weekly-invoice-${String(weekly.invoice_number).padStart(6, '0')}.pdf`

  // 8. Email with itemised HTML body
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'orders@norbakebroome.com'
  const fromName  = process.env.RESEND_FROM_NAME  ?? 'Norbake'
  const replyTo   = process.env.RESEND_REPLY_TO   ?? fromEmail

  let bodyHtml = ''
  for (const day of days) {
    const dateObj = new Date(day.delivery_date + 'T00:00:00')
    const label = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })
    bodyHtml += `<tr style="background:#e5e7eb;"><td colspan="4" style="padding:8px;font-weight:bold;">${label}</td></tr>`
    for (const item of day.items) {
      const name = item.custom_description || item.product_name
      bodyHtml += `<tr>
        <td style="padding:4px 10px;">${name}</td>
        <td style="padding:4px 8px;text-align:center;">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right;">$${item.unit_price.toFixed(2)}</td>
        <td style="padding:4px 8px;text-align:right;">$${item.subtotal.toFixed(2)}</td>
      </tr>`
    }
    bodyHtml += `<tr style="background:#f9fafb;">
      <td colspan="3" style="padding:4px 8px;text-align:right;font-weight:bold;">Day Total</td>
      <td style="padding:4px 8px;text-align:right;font-weight:bold;">$${day.day_total.toFixed(2)}</td>
    </tr>`
  }

  const { error: emailErr } = await resend.emails.send({
    from:    `${fromName} <${fromEmail}>`,
    to:      weekly.customer.email,
    replyTo: replyTo,
    subject: `Weekly Invoice #${weekly.invoice_number} — ${weekly.week_start} to ${weekly.week_end}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2>Weekly Invoice #${weekly.invoice_number}</h2>
        <p>Hi ${weekly.customer.business_name},</p>
        <p>Please find attached your weekly invoice for <strong>${weekly.week_start}</strong> to <strong>${weekly.week_end}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <thead><tr style="background:#000;color:#fff;">
            <th style="padding:8px;text-align:left;">Item</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Unit</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;">Subtotal (ex GST)</td><td style="padding:10px;text-align:right;">$${(Number(weekly.total_amount) - Number(weekly.gst_amount)).toFixed(2)}</td></tr>
          <tr><td style="padding:10px;">GST</td><td style="padding:10px;text-align:right;">$${Number(weekly.gst_amount).toFixed(2)}</td></tr>
          <tr style="background:#f3f4f6;"><td style="padding:10px;font-weight:bold;">Total (inc GST)</td><td style="padding:10px;text-align:right;font-weight:bold;">$${Number(weekly.total_amount).toFixed(2)}</td></tr>
          <tr><td style="padding:10px;">Due Date</td><td style="padding:10px;text-align:right;">${weekly.due_date}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;">Full detail on attached PDF.</p>
        <p>Thank you!<br><strong>${fromName}</strong></p>
      </div>
    `,
    attachments: [{ filename, content: pdfBuffer }],
  })

  if (emailErr) throw new Error(`Email send failed: ${emailErr.message}`)

  await supabase
    .from('weekly_invoices')
    .update({ emailed_at: new Date().toISOString() })
    .eq('id', weeklyInvoiceId)

  return { success: true, email: weekly.customer.email, invoice_number: weekly.invoice_number }
}