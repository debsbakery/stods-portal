export const dynamic = 'force-dynamic'

import { NextResponse, NextRequest } from 'next/server'
import { generatePackingSlip } from '@/lib/packing-slip'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          product_name,
          gst_applicable,
          products (
            id,
            code,
            name
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // ✅ Block cancelled orders
    if (order.status === 'cancelled') {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">Order Cancelled</h2>
          <p>This order has been cancelled. No packing slip available.</p>
          <button onclick="window.close()" style="margin-top:1rem;padding:0.5rem 1rem;cursor:pointer">Close</button>
        </body></html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }
      )
    }

    const orderWithCodes = {
      ...order,
      order_items: (order.order_items || []).map((item: any) => ({
        ...item,
        product_code: item.products?.code || null,
        product_name: item.product_name || item.products?.name || '—',
      })),
    }

    const pdf = await generatePackingSlip({
      order: orderWithCodes as any,
      bakeryInfo: {
        name:    process.env.BAKERY_NAME    ?? "stods bakeryBakery",
        phone:   process.env.BAKERY_PHONE   ?? '(07) 4632 9475',
        address: process.env.BAKERY_ADDRESS ?? '20 Mann St, Toowoomba QLD 4350',
      },
      invoiceNumber: order.invoice_number
        ? String(order.invoice_number).padStart(6, '0')
        : undefined,
    })

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="packing-slip-${orderId.slice(0, 8)}.pdf"`,
        'Cache-Control':       'no-cache',
      },
    })
  } catch (error: any) {
    console.error('Packing slip error:', error)
    return NextResponse.json(
      { error: 'Failed to generate packing slip', details: error.message },
      { status: 500 }
    )
  }
}