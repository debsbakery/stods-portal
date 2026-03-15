// app/api/invoice/[orderId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePDF } from '@/lib/invoice-pdf'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { orderId } = await params
    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download') === 'true'

    // ── Fetch order WITHOUT invoice_numbers join ───────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          gst_applicable,
          product_name,
          custom_description,
          products (
            id,
            code,
            name,
            description
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) throw orderError
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // ── Fetch invoice number separately ───────────────────────
    const { data: invRecord } = await supabase
      .from('invoice_numbers')
      .select('invoice_number, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Fetch customer separately ─────────────────────────────
    let customer: any = null
    if (order.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, business_name, contact_name, email, phone, address, abn, payment_terms')
        .eq('id', order.customer_id)
        .single()
      customer = customerData
    }

    const rawItems = (order.order_items || []) as any[]

    // ── Sort by product code ──────────────────────────────────
    const sortedItems = [...rawItems].sort((a, b) => {
      const codeA = parseInt(a.products?.code?.toString() || '9999')
      const codeB = parseInt(b.products?.code?.toString() || '9999')
      return codeA - codeB
    })

    // ── Build order object ────────────────────────────────────
    const orderWithItems = {
      id:                     order.id,
      invoice_number:         order.invoice_number,
      order_number:           order.order_number || order.id.slice(0, 8).toUpperCase(),
      customer_email:         customer?.email         || order.customer_email,
      customer_business_name: customer?.business_name || order.customer_business_name,
      customer_contact_name:  customer?.contact_name,
      customer_address:       customer?.address       || order.customer_address,
      customer_phone:         customer?.phone,
      customer_abn:           customer?.abn           || order.customer_abn,
      delivery_date:          order.delivery_date,
      created_at:             order.created_at,
      notes:                  order.notes,
      purchase_order_number:  order.purchase_order_number,
      docket_number:          order.docket_number,
      total_amount:           order.total_amount,
      payment_terms:          customer?.payment_terms || 30,
      order_items: sortedItems.map((item: any) => {
        const displayCode = item.products?.code?.toString() || null
        const displayName =
          item.custom_description ||
          item.product_name       ||
          item.products?.name     ||
          '(no description)'
        return {
          id:                  item.id,
          product_id:          item.products?.id,
          product_code:        displayCode,
          product_name:        displayName,
          product_description: item.products?.description ?? null,
          quantity:            item.quantity,
          unit_price:          item.unit_price,
          subtotal:            item.subtotal,
          gst_applicable:      item.gst_applicable !== false,
          custom_description:  item.custom_description ?? null,
        }
      }),
    }

    // ── Bakery config ─────────────────────────────────────────
    const bakeryInfo = {
      name:        process.env.BAKERY_NAME         || '',
      email:       process.env.BAKERY_EMAIL        || '',
      phone:       process.env.BAKERY_PHONE        || '',
      address:     process.env.BAKERY_ADDRESS      || '',
      abn:         process.env.BAKERY_ABN          || '',
      bankName:    process.env.BAKERY_BANK_NAME    || '',
      bankBSB:     process.env.BAKERY_BANK_BSB     || '',
      bankAccount: process.env.BAKERY_BANK_ACCOUNT || '',
    }

    // ── Resolve invoice number ────────────────────────────────
    const invoiceNum = invRecord?.invoice_number
      ? String(invRecord.invoice_number).padStart(6, '0')
      : order.invoice_number
        ? String(order.invoice_number).padStart(6, '0')
        : `TEMP-${order.id.slice(0, 8).toUpperCase()}`

    // ── Generate PDF ──────────────────────────────────────────
    const pdf = await generateInvoicePDF({
      order:  orderWithItems as any,
      bakery: bakeryInfo,
    })

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
    const filename  = `invoice-${invoiceNum}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma':        'no-cache',
        'Expires':       '0',
      },
    })

  } catch (error: any) {
    console.error('Invoice generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice', details: error.message },
      { status: 500 }
    )
  }
}