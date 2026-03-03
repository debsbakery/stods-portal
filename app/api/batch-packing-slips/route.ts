export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateBatchPackingSlips } from '@/lib/batch-packing-slip'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { date, orderIds, codeMin = 0, codeMax = 99999 } = await request.json()

      let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id (
          business_name,
          contact_name
        ),
        order_items (
          quantity,
          product:product_id (
            name,
            code
          )
        )
      `)

    if (date) {
      query = query
        .eq('delivery_date', date)
        .neq('status', 'cancelled')   // ✅ ADD THIS LINE
    } else if (orderIds && orderIds.length > 0) {
      query = query
        .in('id', orderIds)
        .neq('status', 'cancelled')   // ✅ ADD THIS LINE
    } else {
      return NextResponse.json(
        { error: 'Either date or orderIds required' },
        { status: 400 }
      )
    }
    const { data: orders, error } = await query
    if (error) throw error

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No orders found for this date' },
        { status: 404 }
      )
    }

    // ── Map orders and filter items by product code range ─────────────────────
    const mapped = orders
      .map((o: any) => {
        // Filter items to only those within the code range
        const filteredItems = (o.order_items || []).filter((item: any) => {
          const code = Number(item.product?.code ?? 0)
          return code >= codeMin && code <= codeMax
        })

        return {
          id:            o.id,
          delivery_date: o.delivery_date,
          customer: {
            business_name: o.customer?.business_name || o.customer_business_name || 'Unknown',
            contact_name:  o.customer?.contact_name  || o.customer_contact_name  || '',
          },
          order_items: filteredItems.map((item: any) => ({
            quantity: item.quantity,
            product: {
              name:         item.product?.name || item.product_name || '—',
              product_code: item.product?.code || '',
            },
          })),
        }
      })
      // ── Only include orders that have items in the range ───────────────────
      .filter((o: any) => o.order_items.length > 0)

    if (mapped.length === 0) {
      return NextResponse.json(
        { error: `No orders have products in code range ${codeMin}–${codeMax}` },
        { status: 404 }
      )
    }

    const pdfBuffer = await generateBatchPackingSlips(mapped)

    const rangeStr = codeMax === 99999 ? `${codeMin}+` : `${codeMin}-${codeMax}`

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="packing-slips-${date || 'batch'}-codes-${rangeStr}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Batch packing slips error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate packing slips' },
      { status: 500 }
    )
  }
}