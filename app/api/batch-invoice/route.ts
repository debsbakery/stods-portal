export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoicePDF } from '@/lib/pdf/invoice'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { date, orderIds } = await request.json()

    // Fetch orders based on date or orderIds
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        order_items(
  *,
  custom_description,
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

    if (error) {
      console.error('Error fetching orders:', error)
      throw error
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No orders found for the specified criteria' },
        { status: 404 }
      )
    }

    // Generate PDFs and create ZIP
    const zip = new JSZip()

    for (const order of orders) {
      try {
        const pdfBuffer = await generateInvoicePDF(order)
        
        const filename = `invoice-${order.customer.business_name?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || order.customer.id}-${order.id}.pdf`
        
        zip.file(filename, pdfBuffer)
      } catch (err) {
        console.error(`Error generating invoice for order ${order.id}:`, err)
        // Continue with other invoices even if one fails
      }
    }

    // ✅ FIXED: Generate ZIP as ArrayBuffer, then convert to Buffer
    const zipArrayBuffer = await zip.generateAsync({ 
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      }
    })

    // Convert ArrayBuffer to Buffer for Response
    const zipBuffer = Buffer.from(zipArrayBuffer)

    // Return Response with Buffer
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="invoices-${date || 'batch'}.zip"`,
      },
    })

  } catch (error: unknown) {
    console.error('Error generating batch invoices:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate batch invoices'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}