export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStatementPDF } from '@/lib/pdf/statement'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get customers with outstanding balances and email addresses
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, email, business_name, balance')
      .gt('balance', 0)
      .not('email', 'is', null)

    if (customersError) {
      return NextResponse.json(
        { error: 'Failed to fetch customers' },
        { status: 500 }
      )
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: 'No customers with outstanding balances and email addresses',
      })
    }

    let sent = 0
    let failed = 0
    const errors: string[] = []

    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(new Date().setMonth(new Date().getMonth() - 3))
      .toISOString()
      .split('T')[0]

    for (const customer of customers) {
      try {
        // Fetch data for this customer
        const { data: orders } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            delivery_date,
            total_amount,
            status
          `)
          .eq('customer_id', customer.id)
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate)
          .order('delivery_date', { ascending: true })

        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('customer_id', customer.id)
          .gte('payment_date', startDate)
          .lte('payment_date', endDate)
          .order('payment_date', { ascending: true })

        // Calculate opening balance
        const { data: priorOrders } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('customer_id', customer.id)
          .lt('delivery_date', startDate)

        const invoiceTotal = priorOrders?.reduce(
          (sum, order) => sum + parseFloat(order.total_amount || '0'),
          0
        ) || 0

        const { data: priorPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('customer_id', customer.id)
          .lt('payment_date', startDate)

        const paymentTotal = priorPayments?.reduce(
          (sum, pmt) => sum + parseFloat(pmt.amount || '0'),
          0
        ) || 0

        const openingBalance = invoiceTotal - paymentTotal

        // Generate PDF
        const pdfBuffer = await generateStatementPDF({
          customer,
          orders: orders || [],
          payments: payments || [],
          openingBalance,
          startDate,
          endDate,
        })

        // Send email
        await resend.emails.send({
          from: 'debs_bakery@outlook.com',
          to: customer.email!,
          subject: `Monthly Statement - ${customer.business_name || customer.email}`,
          html: `
            <div style="font-family: Arial, sans-serif;">
              <h2 style="color: #006A4E;">Monthly Account Statement</h2>
              <p>Dear ${customer.business_name || 'Valued Customer'},</p>
              <p>Please find attached your monthly account statement.</p>
              <p><strong>Current Balance: $${parseFloat(customer.balance || '0').toFixed(2)}</strong></p>
              <p>Thank you for your continued business.</p>
              <p>Best regards,<br/>Deb's Bakery</p>
            </div>
          `,
          attachments: [
            {
              filename: `statement-${customer.business_name?.replace(/\s/g, '-') || customer.id}.pdf`,
              content: pdfBuffer,
            },
          ],
        })

        console.log(`✅ Statement sent to ${customer.email}`)
        sent++

      } catch (error: any) {
        console.error(`❌ Failed to send statement to ${customer.email}:`, error)
        failed++
        errors.push(`${customer.email}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: customers.length,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error: any) {
    console.error('Send all statements error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send statements' },
      { status: 500 }
    )
  }
}