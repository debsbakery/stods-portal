export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStatementPDF } from '@/lib/pdf/statement'

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const supabase = await createClient()
    const { customerId } = await params

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]

    // Fetch customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Fetch orders
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('delivery_date', { ascending: true })

    if (startDate) {
      ordersQuery = ordersQuery.gte('delivery_date', startDate)
    }
    ordersQuery = ordersQuery.lte('delivery_date', endDate)

    const { data: orders, error: ordersError } = await ordersQuery
    if (ordersError) throw ordersError

    // Fetch payments
    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: true })

    if (startDate) {
      paymentsQuery = paymentsQuery.gte('payment_date', startDate)
    }
    paymentsQuery = paymentsQuery.lte('payment_date', endDate)

    const { data: payments, error: paymentsError } = await paymentsQuery
    if (paymentsError) throw paymentsError

    // Calculate opening balance
    let openingBalance = 0

    if (startDate) {
      const { data: priorOrders } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('customer_id', customerId)
        .lt('delivery_date', startDate)

      const invoiceTotal = priorOrders?.reduce(
        (sum, order) => sum + parseFloat(order.total_amount || '0'),
        0
      ) || 0

      const { data: priorPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('customer_id', customerId)
        .lt('payment_date', startDate)

      
const paymentTotal = priorPayments?.reduce(
  (sum, pmt) => {
    const amount = typeof pmt.amount === 'number'
      ? pmt.amount
      : parseFloat(pmt.amount || '0')
    return sum + amount
  },
  0
) || 0
      openingBalance = invoiceTotal - paymentTotal
    }

    // Generate PDF
    const pdfBuffer = await generateStatementPDF({
      customer,
      orders: orders || [],
      payments: payments || [],
      openingBalance,
      startDate,
      endDate,
    })

    // Sanitize filename
    const sanitizedName = customer.business_name
      ?.replace(/[^a-z0-9]/gi, '-')
      .toLowerCase() || customer.id

    // ✅ FIXED: Return Response instead of NextResponse
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="statement-${sanitizedName}-${endDate}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Error generating statement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate statement' },
      { status: 500 }
    )
  }
}