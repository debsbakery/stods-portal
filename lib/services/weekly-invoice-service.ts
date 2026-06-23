// lib/services/weekly-invoice-service.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail }         from '@/lib/email-sender'
import { generateWeeklyInvoicePDF } from '@/lib/pdf/weekly-invoice-pdf'

export interface WeeklyInvoiceResult {
  success:            boolean
  weekly_invoice_id?: string
  invoice_number?:    number
  customer_id:        string
  week_start:         string
  week_end:           string
  order_count:        number
  total_amount:       number
  gst_amount:         number
  message:            string
  was_revised:        boolean
  email_sent?:        boolean
  email_error?:       string
}

// ── Brisbane-aware week range ─────────────────────────────────────────────────
export function getPreviousWeekRange(anchor: Date = new Date()): { start: string; end: string } {
  const brisbane = new Date(
    anchor.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' })
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

// ── Shared invoice number (orders + weekly_invoices sequence) ─────────────────
async function getNextInvoiceNumber(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
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
    Number(maxOrder?.invoice_number  ?? 0),
    Number(maxWeekly?.invoice_number ?? 0),
  )
  return max + 1
}

// ── Build weekly invoice email HTML ───────────────────────────────────────────
function buildWeeklyInvoiceEmail(params: {
  invoiceNumber: string
  weekStart:     string
  weekEnd:       string
  dueDate:       string
  totalAmount:   number
  gstAmount:     number
  customerName:  string
  isRevised:     boolean
  dayLines: Array<{
    delivery_date:  string
    invoice_number: number | null
    order_id:       string
    total_amount:   number
  }>
  bakery: {
    name:       string
    email:      string
    phone:      string
    address:    string
    abn:        string
    bankName:   string
    bankBSB:    string
    bankAccount:string
  }
  siteUrl: string
}): string {
  const {
    invoiceNumber, weekStart, weekEnd, dueDate,
    totalAmount, gstAmount, customerName, isRevised,
    dayLines, bakery, siteUrl,
  } = params

  const subtotal   = totalAmount - gstAmount
  const periodFrom = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-AU')
  const periodTo   = new Date(weekEnd   + 'T00:00:00').toLocaleDateString('en-AU')
  const dueDateFmt = new Date(dueDate   + 'T00:00:00').toLocaleDateString('en-AU')

  const dayRowsHtml = dayLines.map(line => {
    const dateObj   = new Date(line.delivery_date + 'T00:00:00')
    const dayName   = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const reference = line.invoice_number
      ? `Daily #${String(line.invoice_number).padStart(6, '0')}`
      : `Order ${line.order_id.slice(0, 8).toUpperCase()}`
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #ddd;">${dayName}</td>
        <td style="padding:10px;border-bottom:1px solid #ddd;color:#555;">${reference}</td>
        <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">
          $${Number(line.total_amount).toFixed(2)}
        </td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;}
  .header{background:#3E1F00;color:white;padding:30px;text-align:center;border-radius:8px 8px 0 0;}
  .header h1{margin:0;font-size:26px;}
  .header p{margin:5px 0;opacity:.9;font-size:14px;}
  .badge{background:rgba(255,255,255,.2);padding:6px 18px;border-radius:20px;display:inline-block;margin:6px 4px;font-weight:bold;}
  .revised-banner{background:#dc2626;color:white;text-align:center;padding:10px;font-weight:bold;font-size:15px;}
  .card{background:white;padding:25px;margin:15px 0;border:1px solid #e5e7eb;border-radius:8px;}
  table.items{width:100%;border-collapse:collapse;}
  table.items th{background:#3E1F00;color:white;padding:10px;text-align:left;font-size:14px;}
  .payment-box{background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;padding:20px;margin:15px 0;}
  .bank-row{padding:4px 0;font-size:14px;}
  .footer{text-align:center;color:#888;font-size:12px;padding:20px;border-top:1px solid #e5e7eb;margin-top:20px;}
</style>
</head>
<body>

<div class="header">
  <h1>🍞 ${bakery.name}</h1>
  <p>${bakery.address}</p>
  <p>${bakery.email} | ${bakery.phone}</p>
  <p>ABN: ${bakery.abn}</p>
  <div class="badge">Weekly Tax Invoice</div>
  <div class="badge">Invoice #${invoiceNumber}</div>
</div>

${isRevised ? `<div class="revised-banner">⚠️ REVISED INVOICE — This replaces the previously issued invoice for this week</div>` : ''}

<div class="card">
  <table style="width:100%;">
    <tr>
      <td style="vertical-align:top;">
        <p style="margin:5px 0;font-size:16px;font-weight:bold;">${customerName}</p>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <p style="margin:5px 0;"><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p style="margin:5px 0;"><strong>Period:</strong> ${periodFrom} – ${periodTo}</p>
        <p style="margin:5px 0;"><strong>Due:</strong> ${dueDateFmt}</p>
      </td>
    </tr>
  </table>
</div>

<div class="card">
  <h3 style="margin-top:0;color:#3E1F00;">Deliveries This Week</h3>
  <table class="items">
    <thead>
      <tr>
        <th>Delivery Day</th>
        <th>Reference</th>
        <th style="text-align:right;">Amount (inc GST)</th>
      </tr>
    </thead>
    <tbody>${dayRowsHtml}</tbody>
  </table>

  <div style="margin-top:20px;text-align:right;">
    <p style="margin:4px 0;">Subtotal (ex GST): <strong>$${subtotal.toFixed(2)}</strong></p>
    <p style="margin:4px 0;">GST (10%): <strong>$${gstAmount.toFixed(2)}</strong></p>
    <p style="margin:8px 0;font-size:20px;color:#3E1F00;border-top:2px solid #3E1F00;padding-top:8px;">
      <strong>TOTAL: $${totalAmount.toFixed(2)}</strong>
    </p>
  </div>
</div>

<div class="payment-box">
  <h3 style="margin-top:0;color:#166534;">Payment Information</h3>
  <div class="bank-row"><strong>Bank:</strong> ${bakery.bankName}</div>
  <div class="bank-row"><strong>BSB:</strong> ${bakery.bankBSB}</div>
  <div class="bank-row"><strong>Account:</strong> ${bakery.bankAccount}</div>
  <div class="bank-row"><strong>Reference:</strong> ${invoiceNumber}</div>
  <p style="margin:15px 0 0 0;padding:12px;background:white;border-radius:5px;border-left:4px solid #16a34a;">
    <strong>Payment Due: ${dueDateFmt}</strong>
  </p>
</div>

<div style="text-align:center;margin:20px 0;">
  <a href="${siteUrl}/admin/weekly-invoices"
     style="display:inline-block;padding:12px 25px;background:#3E1F00;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">
    View Invoice Online
  </a>
</div>

<div class="footer">
  <p><strong>${bakery.name}</strong> | ${bakery.address}</p>
  <p>${bakery.email} | ${bakery.phone} | ABN: ${bakery.abn}</p>
  <p>GST included: $${gstAmount.toFixed(2)} | Generated: ${new Date().toLocaleString('en-AU')}</p>
</div>

</body>
</html>`
}

// ── Send email for an already-generated weekly invoice ────────────────────────
export async function sendWeeklyInvoiceEmail(weeklyInvoiceId: string): Promise<{
  success:     boolean
  email_sent_to: string[]
  error?:      string
}> {
  const supabase = createAdminClient()

  const { data: weekly, error: wErr } = await supabase
    .from('weekly_invoices')
    .select('*, customer:customers(id, business_name, email, email_2, address, phone, abn, payment_terms)')
    .eq('id', weeklyInvoiceId)
    .single()

  if (wErr || !weekly) throw new Error('Weekly invoice not found')

  const customer = weekly.customer as any
  if (!customer?.email) throw new Error('Customer has no email address')

  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', weeklyInvoiceId)

  const orderIds = (links ?? []).map((l: any) => l.order_id)

 const { data: orders } = await supabase
  .from('orders')
  .select('id, delivery_date, invoice_number, total_amount, purchase_order_number, order_items(id, quantity, unit_price, subtotal, custom_description, gst_applicable, product:products(name, unit))')
  .in('id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
  .order('delivery_date', { ascending: true })

 const dayLines = (orders ?? []).map((o: any) => ({
  delivery_date:         o.delivery_date,
  invoice_number:        o.invoice_number,
  order_id:              o.id,
  total_amount:          Number(o.total_amount || 0),
  order_items:           o.order_items ?? [],
  purchase_order_number: o.purchase_order_number ?? null,
}))

  const bakery = {
    name:        process.env.RESEND_FROM_NAME    ?? process.env.BAKERY_NAME    ?? '',
    email:       process.env.RESEND_FROM_EMAIL   ?? process.env.BAKERY_EMAIL   ?? '',
    phone:       process.env.BAKERY_PHONE        ?? '',
    address:     process.env.BAKERY_ADDRESS      ?? '',
    abn:         process.env.BAKERY_ABN          ?? '',
    bankName:    process.env.BAKERY_BANK_NAME    ?? '',
    bankBSB:     process.env.BAKERY_BANK_BSB     ?? '',
    bankAccount: process.env.BAKERY_BANK_ACCOUNT ?? '',
  }

  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const fromName   = process.env.RESEND_FROM_NAME  ?? bakery.name
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? bakery.email
  const invoiceNum = String(weekly.invoice_number ?? weekly.id.slice(0,8).toUpperCase()).padStart(6, '0')
  const isRevised  = weekly.status === 'revised'

  const html = buildWeeklyInvoiceEmail({
    invoiceNumber: invoiceNum,
    weekStart:     weekly.week_start,
    weekEnd:       weekly.week_end,
    dueDate:       weekly.due_date ?? weekly.week_end,
    totalAmount:   Number(weekly.total_amount),
    gstAmount:     Number(weekly.gst_amount),
    customerName:  customer.business_name ?? customer.email,
    isRevised,
    dayLines,
    bakery,
    siteUrl,
  })

  // Generate PDF
  let pdfBuffer: Buffer | null = null
  try {
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
        business_name: customer.business_name,
        email:         customer.email,
        address:       customer.address,
        phone:         customer.phone,
        abn:           customer.abn,
      },
 days: dayLines.map(line => ({
  delivery_date: line.delivery_date,
  day_total:     line.total_amount,
  po_number:     line.purchase_order_number ?? null,
  items: (line.order_items ?? []).map((i: any) => ({
    product_name:       i.product?.name || 'Item',
    custom_description: i.custom_description || null,
    quantity:           i.quantity,
    unit_price:         i.unit_price,
    subtotal:           i.subtotal,
    gst_applicable:     i.gst_applicable ?? true,
  })),
})),
      bakery,
    })
    pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  } catch (pdfErr) {
    console.warn('[weekly-email] PDF generation failed:', pdfErr)
  }

  const safeCustomerName = (customer.business_name ?? 'customer')
    .replace(/[^a-z0-9]/gi, '-').substring(0, 40)

  const attachments = pdfBuffer ? [{
    filename:    `Weekly-Invoice-${invoiceNum}-${safeCustomerName}.pdf`,
    content:     pdfBuffer,
    contentType: 'application/pdf',
  }] : undefined

  const subject = isRevised
    ? `REVISED: Weekly Invoice ${invoiceNum} — ${bakery.name}`
    : `Weekly Invoice ${invoiceNum} — ${bakery.name}`

  const emailsSentTo: string[] = []

  await sendEmail({
    to:          customer.email,
    subject,
    html,
    from:        `${fromName} <${fromEmail}>`,
    attachments,
  })
  emailsSentTo.push(customer.email)

  if (customer.email_2) {
    await new Promise(r => setTimeout(r, 400))
    await sendEmail({
      to:          customer.email_2,
      subject,
      html,
      from:        `${fromName} <${fromEmail}>`,
      attachments,
    })
    emailsSentTo.push(customer.email_2)
  }

  await supabase
    .from('weekly_invoices')
    .update({ emailed_at: new Date().toISOString() } as any)
    .eq('id', weeklyInvoiceId)

  return { success: true, email_sent_to: emailsSentTo }
}

// ── Generate (+ optionally send email) ───────────────────────────────────────
export async function generateWeeklyInvoice(
  customerId: string,
  weekStart:  string,
  weekEnd:    string,
  options: { sendEmail?: boolean } = {}
): Promise<WeeklyInvoiceResult> {
  const supabase = createAdminClient()

  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, business_name, payment_terms, invoice_frequency, invoice_brand')
    .eq('id', customerId)
    .single()

  if (cErr || !customer) throw new Error(`Customer ${customerId} not found`)
  if (customer.invoice_frequency !== 'weekly') {
    throw new Error(
      `Customer "${customer.business_name}" is set to '${customer.invoice_frequency}' billing — must be 'weekly'.`
    )
  }

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

  const totalAmount = Math.round(
    orders.reduce((s, o) => s + Number(o.total_amount || 0), 0) * 100
  ) / 100

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

  const dueDate = new Date(weekEnd)
  dueDate.setDate(dueDate.getDate() + (customer.payment_terms ?? 14))
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('weekly_invoices')
    .select('id, invoice_number, status')
    .eq('customer_id', customerId)
    .eq('week_start',  weekStart)
    .maybeSingle()

  let weeklyId:      string
  let invoiceNumber: number
  let wasRevised = false

  if (existing) {
    wasRevised    = true
    weeklyId      = existing.id
    invoiceNumber = existing.invoice_number ?? 0

    await supabase.from('weekly_invoices').update({
      total_amount:  totalAmount,
      gst_amount:    gstAmount,
      status:        'revised',
      revised_at:    new Date().toISOString(),
      due_date:      dueDateStr,
    }).eq('id', existing.id)

    await supabase.from('weekly_invoice_orders').delete().eq('weekly_invoice_id', existing.id)

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
      })
      .select('id')
      .single()

    if (insErr || !created) throw new Error(insErr?.message ?? 'Failed to create weekly invoice')
    weeklyId = created.id
  }

  await supabase.from('weekly_invoice_orders').insert(
    orderIds.map(oid => ({ weekly_invoice_id: weeklyId, order_id: oid }))
  )

  await supabase.from('orders').update({
    weekly_invoice_id: weeklyId,
    status:            'invoiced',
    invoice_number:    invoiceNumber,
  }).in('id', orderIds)

  // Sync AR transaction
  await supabase.from('ar_transactions').delete().eq('description', `weekly:${weeklyId}`)
  await supabase.from('ar_transactions').insert({
    customer_id:  customerId,
    type:         'invoice',
    amount:       totalAmount,
    due_date:     dueDateStr,
    description:  `weekly:${weeklyId}`,
    created_at:   new Date().toISOString(),
  })

  // Recalculate customer balance
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

  await supabase.from('customers').update({ balance: newBalance }).eq('id', customerId)

  let emailSent  = false
  let emailError: string | undefined

  if (options.sendEmail) {
    try {
      await sendWeeklyInvoiceEmail(weeklyId)
      emailSent = true
    } catch (e: any) {
      emailError = e.message
      console.error('[weekly-invoice] Email failed:', e.message)
    }
  }

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
    email_sent:        emailSent,
    email_error:       emailError,
  }
}