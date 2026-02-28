import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email-sender'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string
  quantity: number
  unit_price: number
  subtotal: number
  gst_applicable: boolean | null
  products: {
    id: string
    product_code: string | null
    name: string | null
  } | null
}

interface Customer {
  id: string
  business_name: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  abn: string | null
  payment_terms: number | null
}

interface Order {
  id: string
  customer_id: string
  total_amount: number
  delivery_date: string
  invoice_number: number | null
  created_at: string
  notes: string | null
  purchase_order_number: string | null
  docket_number: string | null
  customers: Customer | null
  order_items: OrderItem[]
}

interface BakeryConfig {
  name: string
  email: string
  phone: string
  address: string
  abn: string
  bankBSB: string
  bankAccount: string
  bankName: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBakeryConfig(): BakeryConfig {
  return {
    name:        process.env.BAKERY_NAME         ?? "Deb's Bakery",
    email:       process.env.BAKERY_EMAIL        ?? 'debs_bakery@outlook.com',
    phone:       process.env.BAKERY_PHONE        ?? '(07) 4632 9475',
    address:     process.env.BAKERY_ADDRESS      ?? '20 Mann St, Toowoomba QLD 4350',
    abn:         process.env.BAKERY_ABN          ?? '81 067 719 439',
    bankBSB:     process.env.BAKERY_BANK_BSB     ?? 'XXX-XXX',
    bankAccount: process.env.BAKERY_BANK_ACCOUNT ?? 'XXXXXXXXXX',
    bankName:    process.env.BAKERY_BANK_NAME    ?? 'Bank Name',
  }
}

function computeDueDate(deliveryDate: string, paymentTerms: number): Date {
  const due = new Date(`${deliveryDate}T00:00:00`)
  due.setDate(due.getDate() + paymentTerms)
  return due
}

function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  return date.toLocaleDateString('en-AU', options)
}

// ── Invoice Number Generator ──────────────────────────────────────────────────
// Uses the invoice_numbers table — inserts a row and returns the generated number.
// Adjust the insert/select to match your actual invoice_numbers schema.

async function generateInvoiceNumber(
  supabase: ReturnType<typeof createClient>,
  orderId: string
): Promise<number> {
  // First check if this order already has one (idempotent)
  const { data: existing } = await supabase
    .from('invoice_numbers')
    .select('invoice_number')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existing?.invoice_number) {
    return existing.invoice_number as number
  }

  // Insert new row — if your table uses a sequence/trigger for invoice_number,
  // insert and read back. If not, get max + 1.
  const { data: maxRow } = await supabase
    .from('invoice_numbers')
    .select('invoice_number')
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNumber = ((maxRow?.invoice_number as number) ?? 0) + 1

  const { error: insertError } = await supabase
    .from('invoice_numbers')
    .insert({ order_id: orderId, invoice_number: nextNumber })

  if (insertError) {
    console.error('Failed to insert invoice_number:', insertError)
    throw insertError
  }

  return nextNumber
}

// ── Email Builder ─────────────────────────────────────────────────────────────

function buildInvoiceEmail(params: {
  order: Order
  invoiceNumber: string
  bakery: BakeryConfig
  siteUrl: string
}): string {
  const { order, invoiceNumber, bakery, siteUrl } = params
  const customer = order.customers!
  const paymentTerms = customer.payment_terms ?? 30
  const dueDate = computeDueDate(order.delivery_date, paymentTerms)
  const deliveryDateObj = new Date(`${order.delivery_date}T00:00:00`)
  const orderCreatedDate = new Date(order.created_at)
  const todayDate = new Date()

  const subtotal = order.order_items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)
  const gstTotal = order.order_items.reduce((sum, item) => {
    const hasGST = item.gst_applicable !== false
    return sum + (hasGST ? (item.subtotal ?? 0) * 0.1 : 0)
  }, 0)
  const total = subtotal + gstTotal

  const lineItemsHtml = order.order_items
    .map((item) => {
      const product = item.products
      const hasGST = item.gst_applicable !== false
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #ddd;">${product?.product_code ?? 'N/A'}</td>
          <td style="padding:10px;border-bottom:1px solid #ddd;">${product?.name ?? 'Unknown Product'}</td>
          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;">$${(item.unit_price ?? 0).toFixed(2)}</td>
          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">${hasGST ? 'Yes' : 'No'}</td>
          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">$${(item.subtotal ?? 0).toFixed(2)}</td>
        </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
    .container{max-width:700px;margin:0 auto}
    .header{background:#006A4E;color:white;padding:30px;text-align:center}
    .content{padding:30px;background:#f9f9f9}
    .card{background:white;padding:20px;border-radius:8px;margin:20px 0;box-shadow:0 2px 4px rgba(0,0,0,.1)}
    .invoice-table{width:100%;border-collapse:collapse;margin:20px 0}
    .invoice-table th{background:#333;color:white;padding:12px;text-align:left;font-size:13px}
    .invoice-table td{padding:10px;border-bottom:1px solid #ddd;font-size:13px}
    .totals{text-align:right;margin:20px 0}
    .totals-row{margin:8px 0;font-size:14px}
    .total-grand{font-size:1.3em;font-weight:bold;color:#CE1126;padding-top:10px;border-top:2px solid #333;margin-top:10px}
    .btn{display:inline-block;background:#006A4E;color:white;padding:14px 28px;text-decoration:none;border-radius:5px;font-weight:bold;margin:8px}
    .btn-secondary{background:#CE1126}
    .footer{text-align:center;padding:20px;color:#666;font-size:13px;border-top:1px solid #ddd;margin-top:30px}
    .payment-box{background:#f0fdf4;padding:20px;border-radius:8px;border-left:4px solid #16a34a}
    .bank-details{background:white;padding:15px;border-radius:5px;margin:10px 0;border:1px solid #ddd}
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:32px;">${bakery.name}</h1>
    <p style="margin:10px 0 0 0;font-size:18px;">Tax Invoice</p>
    <p style="margin:5px 0;font-size:13px;">${bakery.address}</p>
    <p style="margin:3px 0;font-size:13px;">${bakery.email} | ${bakery.phone}</p>
    <p style="margin:3px 0;font-size:13px;"><strong>ABN:</strong> ${bakery.abn}</p>
  </div>

  <div class="content">
    <div class="card">
      <h2 style="color:#006A4E;margin-top:0;">Invoice #${invoiceNumber}</h2>

      ${order.purchase_order_number || order.docket_number ? `
      <div style="background:#f8f9fa;padding:10px;border-left:4px solid #006A4E;margin:10px 0;">
        ${order.purchase_order_number ? `<p style="margin:5px 0;"><strong>PO Number:</strong> ${order.purchase_order_number}</p>` : ''}
        ${order.docket_number ? `<p style="margin:5px 0;"><strong>Docket Number:</strong> ${order.docket_number}</p>` : ''}
      </div>` : ''}

      <table style="width:100%;margin-top:20px;">
        <tr>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:5px 0;"><strong>Bill To:</strong></p>
            <p style="margin:5px 0;font-size:15px;font-weight:bold;">${customer.business_name ?? 'N/A'}</p>
            ${customer.contact_name ? `<p style="margin:5px 0;">Attn: ${customer.contact_name}</p>` : ''}
            ${customer.address ? `<p style="margin:5px 0;">${customer.address}</p>` : ''}
            ${customer.phone ? `<p style="margin:5px 0;">${customer.phone}</p>` : ''}
            ${customer.abn ? `<p style="margin:5px 0;"><strong>ABN:</strong> ${customer.abn}</p>` : ''}
          </td>
          <td style="width:50%;vertical-align:top;text-align:right;">
            <p style="margin:5px 0;"><strong>Order Date:</strong> ${formatDate(orderCreatedDate)}</p>
            <p style="margin:5px 0;"><strong>Invoice Date:</strong> ${formatDate(todayDate)}</p>
            <p style="margin:5px 0;"><strong>Delivery Date:</strong> ${formatDate(deliveryDateObj, {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
            })}</p>
            <p style="margin:5px 0;"><strong>Payment Due:</strong> ${formatDate(dueDate)}</p>
            <p style="margin:5px 0;color:#666;">(${paymentTerms} days)</p>
          </td>
        </tr>
      </table>
    </div>

    ${order.notes ? `
    <div class="card" style="background:#fffbeb;border-left:4px solid #f59e0b;">
      <p style="margin:0;font-weight:bold;color:#92400e;">Order Notes:</p>
      <p style="margin:10px 0 0 0;">${order.notes}</p>
    </div>` : ''}

    <div class="card">
      <h3 style="margin-top:0;">Order Details</h3>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Code</th><th>Product</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:center;">GST</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${lineItemsHtml}</tbody>
      </table>
      <div class="totals">
        <div class="totals-row"><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</div>
        <div class="totals-row"><strong>GST (10%):</strong> $${gstTotal.toFixed(2)}</div>
        <div class="totals-row total-grand"><strong>TOTAL:</strong> $${total.toFixed(2)}</div>
      </div>
    </div>

    <div style="text-align:center;margin:30px 0;">
      <a href="${siteUrl}/api/invoice/${order.id}" class="btn">View Invoice Online</a>
      <a href="${siteUrl}/api/invoice/${order.id}?download=true" class="btn btn-secondary">Download PDF</a>
    </div>

    <div class="payment-box">
      <h3 style="margin-top:0;color:#166534;">Payment Information</h3>
      <div class="bank-details">
        <p style="margin:5px 0;font-weight:bold;">Bank Transfer Details:</p>
        <p style="margin:5px 0;"><strong>Bank:</strong> ${bakery.bankName}</p>
        <p style="margin:5px 0;"><strong>BSB:</strong> ${bakery.bankBSB}</p>
        <p style="margin:5px 0;"><strong>Account:</strong> ${bakery.bankAccount}</p>
        <p style="margin:5px 0;"><strong>Reference:</strong> ${invoiceNumber}</p>
      </div>
      <ul style="line-height:2;margin:5px 0;">
        <li>Cash or Cheque at delivery</li>
        <li>In person at ${bakery.address}</li>
      </ul>
      <p style="padding:15px;background:white;border-radius:5px;border-left:4px solid #16a34a;margin-top:15px;">
        <strong>Payment Due:</strong> ${formatDate(dueDate, {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
        })}
      </p>
    </div>

    <div class="footer">
      <p><strong>${bakery.name}</strong> | ${bakery.address}</p>
      <p>${bakery.email} | ${bakery.phone} | ABN: ${bakery.abn}</p>
      <p style="font-size:11px;color:#999;">Tax Invoice — GST included: $${gstTotal.toFixed(2)}</p>
      <p style="font-size:11px;color:#999;">Generated: ${todayDate.toLocaleString('en-AU')}</p>
    </div>
  </div>
</div>
</body>
</html>`
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { delivery_date, sendEmails = false } = await request.json()

    if (!delivery_date || !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)) {
      return NextResponse.json(
        { success: false, error: 'delivery_date required in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    // ── Fetch pending orders ─────────────────────────────────────────────────
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, customer_id, total_amount, delivery_date,
        invoice_number, created_at, notes,
        purchase_order_number, docket_number,
        customers (
          id, business_name, contact_name, email,
          phone, address, abn, payment_terms
        ),
        order_items (
          id, quantity, unit_price, subtotal, gst_applicable,
          products ( id, product_code, name )
        )
      `)
      .eq('status', 'pending')
      .eq('delivery_date', delivery_date)

    if (ordersError) throw ordersError

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending orders to invoice for this date',
        invoiced: 0, total_amount: 0, emails_sent: 0,
      })
    }

    const typedOrders = orders as unknown as Order[]
    console.log(`Found ${typedOrders.length} pending orders for ${delivery_date}`)

    // ── STEP 1: Generate invoice numbers and write back to orders ─────────────
    // This is the step that was previously MISSING
    const orderInvoiceMap: Map<string, number> = new Map()

    for (const order of typedOrders) {
      const invoiceNum = await generateInvoiceNumber(supabase, order.id)
      orderInvoiceMap.set(order.id, invoiceNum)
    }

    // ✅ Write invoice numbers back to orders table immediately
    for (const [orderId, invoiceNum] of orderInvoiceMap.entries()) {
      const { error: writeBackError } = await supabase
        .from('orders')
        .update({ invoice_number: invoiceNum })
        .eq('id', orderId)

      if (writeBackError) {
        console.error(`Failed to write invoice_number ${invoiceNum} to order ${orderId}:`, writeBackError)
        throw writeBackError
      }
    }

    console.log(`Invoice numbers written to ${orderInvoiceMap.size} orders`)

    // ── STEP 2: Create AR transactions ───────────────────────────────────────
    const arTransactions = typedOrders.map((order) => {
      const paymentTerms = order.customers?.payment_terms ?? 30
      const dueDate = computeDueDate(order.delivery_date, paymentTerms)
      const invoiceNum = orderInvoiceMap.get(order.id)!

      return {
        customer_id: order.customer_id,
        type:        'invoice',
        amount:      order.total_amount,
        amount_paid: 0,
        invoice_id:  order.id,
        description: `Invoice #${String(invoiceNum).padStart(6, '0')} - ${order.customers?.business_name ?? 'Customer'}`,
        due_date:    dueDate.toISOString().split('T')[0],
        created_at:  new Date().toISOString(),
      }
    })

    const { error: arError } = await supabase.from('ar_transactions').insert(arTransactions)
    if (arError) throw arError
    console.log('AR transactions created')

    // ── STEP 3: Mark orders as invoiced ─────────────────────────────────────
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status:      'invoiced',
        invoiced_at: new Date().toISOString(),
      })
      .in('id', typedOrders.map((o) => o.id))

    if (updateError) throw updateError
    console.log('Orders marked as invoiced')

    const totalAmount = typedOrders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)

    // ── STEP 4: Send emails ──────────────────────────────────────────────────
    let emailsSent = 0
    const emailErrors: string[] = []

    if (sendEmails) {
      const bakery = getBakeryConfig()
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debsbakery-portal.vercel.app'

      for (const order of typedOrders) {
        try {
          const customer = order.customers
          if (!customer?.email) {
            console.warn(`No email for order ${order.id} — skipping`)
            continue
          }

          // Use the real invoice number we just wrote — never TEMP-
          const invoiceNum   = orderInvoiceMap.get(order.id)!
          const invoiceNumber = String(invoiceNum).padStart(6, '0')

          const html = buildInvoiceEmail({ order, invoiceNumber, bakery, siteUrl })

          await sendEmail({
            to:      customer.email,
            subject: `Invoice ${invoiceNumber} - ${bakery.name}`,
            html,
          })

          emailsSent++
          console.log(`Sent invoice ${invoiceNumber} to ${customer.email}`)
        } catch (emailError: any) {
          const custEmail = order.customers?.email ?? 'unknown'
          console.error(`Failed sending to ${custEmail}:`, emailError.message)
          emailErrors.push(`${custEmail}: ${emailError.message}`)
        }
      }
    }

    return NextResponse.json({
      success:      true,
      invoiced:     typedOrders.length,
      total_amount: totalAmount,
      emails_sent:  emailsSent,
      email_errors: emailErrors.length > 0 ? emailErrors : undefined,
      date:         delivery_date,
      invoice_numbers: Object.fromEntries(orderInvoiceMap),
    })

  } catch (error: any) {
    console.error('Batch invoice error:', error)
    return NextResponse.json(
      { success: false, error: error.message ?? 'Failed to process batch invoice' },
      { status: 500 }
    )
  }
}

// ── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate   = searchParams.get('end_date')

    let query = supabase
      .from('orders')
      .select('delivery_date, status, total_amount')
      .eq('status', 'pending')
      .order('delivery_date')

    if (startDate) query = query.gte('delivery_date', startDate)
    if (endDate)   query = query.lte('delivery_date', endDate)

    const { data: orders, error } = await query
    if (error) throw error

    const grouped = (orders ?? []).reduce(
      (acc: Record<string, { delivery_date: string; count: number; total_amount: number }>, order) => {
        const date = order.delivery_date
        if (!acc[date]) acc[date] = { delivery_date: date, count: 0, total_amount: 0 }
        acc[date].count        += 1
        acc[date].total_amount += order.total_amount ?? 0
        return acc
      },
      {}
    )

    return NextResponse.json({ success: true, pending_by_date: Object.values(grouped) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}