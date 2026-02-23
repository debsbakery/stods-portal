import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateInvoice } from '@/lib/invoice'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const orderId = params.id
    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download') === 'true'

    console.log('📄 Generating invoice for order:', orderId)

    // ✅ FETCH COMPLETE ORDER DATA with products and customer
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        customers (
          id,
          business_name,
          contact_name,
          email,
          phone,
          address,
          abn,
          payment_terms
        ),
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          gst_applicable,
          products (
            id,
            product_code,
            name,
            description
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      console.error('❌ Error fetching order:', orderError)
      throw orderError
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    console.log('✅ Order fetched:', {
      id: order.id,
      items: order.order_items?.length || 0,
      customer: (order.customers as any)?.business_name
    })

    // ✅ TRANSFORM DATA for PDF generator
    const customer = order.customers as any
    
    const orderWithItems = {
      id: order.id,
      invoice_number: order.invoice_number,
      order_number: order.order_number || order.id.slice(0, 8).toUpperCase(),
      customer_email: order.customer_email,
      customer_business_name: customer?.business_name || order.customer_business_name,
      customer_contact_name: customer?.contact_name,
      customer_address: customer?.address || order.customer_address,
      customer_phone: customer?.phone,
      customer_abn: customer?.abn || order.customer_abn,
      delivery_date: order.delivery_date,
      created_at: order.created_at,
      notes: order.notes,
      purchase_order_number: order.purchase_order_number, // ✅ ADD PO
      docket_number: order.docket_number, // ✅ ADD DOCKET
      total_amount: order.total_amount,
      payment_terms: customer?.payment_terms || 30,
      order_items: (order.order_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.products?.id,
        product_code: item.products?.product_code, // ✅ PRODUCT CODE
        product_name: item.products?.name || item.product_name,
        product_description: item.products?.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        gst_applicable: item.gst_applicable !== false
      }))
    }

    console.log('📦 Transformed order data:', {
      items: orderWithItems.order_items.length,
      firstItem: orderWithItems.order_items[0],
      poNumber: orderWithItems.purchase_order_number,
      docketNumber: orderWithItems.docket_number
    })

    // ✅ BAKERY INFO from environment
    const bakeryInfo = {
      name: process.env.BAKERY_NAME || "Deb's Bakery",
      email: process.env.BAKERY_EMAIL || 'debs_bakery@outlook.com',
      phone: process.env.BAKERY_PHONE || '(07) 4632 9475',
      address: process.env.BAKERY_ADDRESS || '20 Mann St, Toowoomba QLD 4350',
      abn: process.env.BAKERY_ABN || '81 067 719 439',
      bankName: process.env.BAKERY_BANK_NAME || 'Bank Name',
      bankBSB: process.env.BAKERY_BANK_BSB || 'BSB: XXX-XXX',
      bankAccount: process.env.BAKERY_BANK_ACCOUNT || 'Account: XXXXXXXXXX'
    }

    console.log('🏦 Using bakery info:', bakeryInfo)

    // ✅ GENERATE PDF
    const pdf = await generateInvoice({
      order: orderWithItems as any,
      bakeryInfo
    })

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))

    const invoiceNum = order.invoice_number 
      ? String(order.invoice_number).padStart(6, '0')
      : `TEMP-${order.id.slice(0, 8).toUpperCase()}`

    const filename = `invoice-${invoiceNum}.pdf`

    // ✅ RETURN PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': download 
          ? `attachment; filename="${filename}"` 
          : `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error: any) {
    console.error('❌ Invoice generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice', details: error.message },
      { status: 500 }
    )
  }
}