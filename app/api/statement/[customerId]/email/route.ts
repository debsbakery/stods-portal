export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
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

    if (customerError || !customer || !customer.email) {
      return NextResponse.json(
        { error: 'Customer not found or no email on file' },
        { status: 400 }
      )
    }

    // Fetch orders
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('delivery_date', { ascending: true })

    if (startDate) ordersQuery = ordersQuery.gte('delivery_date', startDate)
    ordersQuery = ordersQuery.lte('delivery_date', endDate)

    const { data: orders } = await ordersQuery

    // Fetch payments
    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: true })

    if (startDate) paymentsQuery = paymentsQuery.gte('payment_date', startDate)
    paymentsQuery = paymentsQuery.lte('payment_date', endDate)

    const { data: payments } = await paymentsQuery

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
        (sum, pmt) => sum + parseFloat(pmt.amount || '0'),
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

    // Format dates for email
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    }

    // Send email
    const { data, error } = await resend.emails.send({
      from: 'debs_bakery@outlook.com',
      to: customer.email,
      subject: `Account Statement - ${customer.business_name || customer.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #006A4E;">Account Statement</h2>
          
          <p>Dear ${customer.business_name || customer.contact_name || 'Valued Customer'},</p>
          
          <p>Please find attached your account statement for the period:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Period:</strong> ${startDate ? formatDate(startDate) : 'Beginning'} to ${formatDate(endDate)}</p>
            <p style="margin: 5px 0;"><strong>Current Balance:</strong> $${parseFloat(customer.balance || '0').toFixed(2)}</p>
          </div>
          
          <p>If you have any questions about your account, please contact us.</p>
          
          <p style="margin-top: 30px;">
            Thank you,<br/>
            <strong style="color: #006A4E;">Deb's Bakery</strong>
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `statement-${customer.business_name?.replace(/\s/g, '-') || customer.id}-${endDate}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `Statement sent to ${customer.email}`,
    })

  } catch (error: any) {
    console.error('Error emailing statement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send statement' },
      { status: 500 }
    )
  }
}