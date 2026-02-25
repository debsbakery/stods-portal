export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateBatchPackingSlips } from '@/lib/batch-packing-slip'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { date, orderIds } = await request.json()

    // Fetch orders
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        order_items(
          *,
          product:products(*)
        )
      `)

    if (date) {
      query = query.eq('delivery_date', date)
    } else if (orderIds && orderIds.length > 0) {
      query = query.in('id', orderIds)
    } else {
      return NextResponse.json(
        { error: 'Either date or orderIds must be provided' },
        { status: 400 }
      )
    }

    const { data: orders, error } = await query

    if (error) throw error

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No orders found' },
        { status: 404 }
      )
    }

    // Generate PDF
    const pdfBuffer = await generateBatchPackingSlips(orders)

    // ✅ FIXED: Cast Buffer to Uint8Array for Response
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="packing-slips-${date || 'batch'}.pdf"`,
      },
    })

  } catch (error: unknown) {
    console.error('Error generating batch packing slips:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate packing slips'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}