import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email-sender'

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { delivery_date, sendEmails = false } = await request.json()

    if (!delivery_date) {
      return NextResponse.json({ 
        success: false, 
        error: 'delivery_date required' 
      }, { status: 400 })
    }

    console.log('📊 Batch invoicing for date:', delivery_date)

    // Get all pending orders for this delivery date
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        total_amount,
        delivery_date,
        customers (
          business_name,
          email,
          payment_terms
        )
      `)
      .eq('status', 'pending')
      .eq('delivery_date', delivery_date)

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError)
      throw ordersError
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No pending orders to invoice for this date',
        invoiced: 0,
        total_amount: 0,
        emails_sent: 0
      })
    }

    console.log(`✅ Found ${orders.length} pending orders`)

    // Calculate due dates based on payment terms
    const arTransactions = orders.map(order => {
      const customer = order.customers as any
      const paymentTerms = customer?.payment_terms || 30
      const dueDate = new Date(delivery_date)
      dueDate.setDate(dueDate.getDate() + paymentTerms)

      return {
        customer_id: order.customer_id,
        type: 'invoice',
        amount: order.total_amount,
        amount_paid: 0,
        invoice_id: order.id,
        description: `Invoice for order ${order.id.substring(0, 8)} - ${customer?.business_name || 'Customer'}`,
        due_date: dueDate.toISOString().split('T')[0],
        created_at: new Date().toISOString()
      }
    })

    // Insert AR transactions
    const { error: arError } = await supabase
      .from('ar_transactions')
      .insert(arTransactions)

    if (arError) {
      console.error('❌ Error creating AR transactions:', arError)
      throw arError
    }

    console.log('✅ Created AR transactions')

    // Update order statuses to 'invoiced' and get assigned invoice numbers
    const { data: updatedOrders, error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'invoiced',
        invoiced_at: new Date().toISOString()
      })
      .in('id', orders.map(o => o.id))
      .select('id, invoice_number, customer_id')

    if (updateError) {
      console.error('❌ Error updating order statuses:', updateError)
      throw updateError
    }

    console.log('✅ Updated order statuses to invoiced')
    console.log('✅ Invoice numbers assigned:', updatedOrders)

    const totalAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

    // ✅ Send invoice emails if requested
    let emailsSent = 0
    const emailErrors: string[] = []
    
    if (sendEmails) {
      console.log('📧 Sending invoice emails...')
      
      for (const order of orders) {
        try {
          const customer = order.customers as any
          
          if (!customer?.email) {
            console.warn(`  ⚠️ No email for order ${order.id}`)
            continue
          }
          
          // Find the updated order with invoice number
          const updatedOrder = updatedOrders?.find(u => u.id === order.id)
          const invoiceNumber = updatedOrder?.invoice_number 
            ? String(updatedOrder.invoice_number).padStart(6, '0')
            : `TEMP-${order.id.slice(0, 8).toUpperCase()}`
          
          const paymentTerms = customer.payment_terms || 30
          const dueDate = new Date(delivery_date)
          dueDate.setDate(dueDate.getDate() + paymentTerms)
          
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery-portal.vercel.app'
          
          await sendEmail({
            to: customer.email,
            subject: `Invoice ${invoiceNumber} - Debs Bakery`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #006A4E; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">Deb's Bakery</h1>
                  <p style="margin: 5px 0 0 0;">Tax Invoice</p>
                </div>
                
                <div style="padding: 30px; background: #f9f9f9;">
                  <h2 style="color: #006A4E; margin-top: 0;">Invoice ${invoiceNumber}</h2>
                  
                  <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Customer:</strong> ${customer.business_name || 'N/A'}</p>
                    <p><strong>Delivery Date:</strong> ${new Date(delivery_date).toLocaleDateString('en-AU', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</p>
                    <p style="font-size: 1.2em; margin-top: 20px;">
                      <strong>Total Amount:</strong> 
                      <span style="color: #CE1126; font-size: 1.3em;">$${order.total_amount.toFixed(2)}</span>
                    </p>
                    <p><strong>Payment Due:</strong> ${dueDate.toLocaleDateString('en-AU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })} (${paymentTerms} days)</p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${siteUrl}/api/invoice/${order.id}" 
                       style="background: #CE1126; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                      📄 Download Invoice PDF
                    </a>
                  </div>
                  
                  <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Payment Options:</h3>
                    <ul style="line-height: 1.8;">
                      <li><strong>Bank Transfer:</strong> BSB 123-456, Account 78901234</li>
                      <li><strong>Cash/Check:</strong> At delivery or in person</li>
                      <li><strong>Reference:</strong> ${invoiceNumber}</li>
                    </ul>
                  </div>
                  
                  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666; text-align: center;">
                    <p>Questions? Contact us at ${process.env.BAKERY_EMAIL || 'debs_bakery@outlook.com'}</p>
                    <p>Phone: ${process.env.BAKERY_PHONE || '(04) 1234-5678'}</p>
                  </div>
                </div>
              </div>
            `,
          })
          
          emailsSent++
          console.log(`  ✅ Invoice ${invoiceNumber} sent to ${customer.business_name || customer.email}`)
        } catch (emailError: any) {
          const custEmail = (order.customers as any)?.email || 'unknown'
          console.error(`  ⚠️ Failed to email ${custEmail}:`, emailError.message)
          emailErrors.push(`${custEmail}: ${emailError.message}`)
        }
      }
      
      console.log(`📧 Sent ${emailsSent}/${orders.length} invoice emails`)
    }

    return NextResponse.json({ 
      success: true, 
      invoiced: orders.length,
      total_amount: totalAmount,
      emails_sent: emailsSent,
      email_errors: emailErrors.length > 0 ? emailErrors : undefined,
      date: delivery_date
    })

  } catch (error: any) {
    console.error('❌ Batch invoice error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to process batch invoice' 
    }, { status: 500 })
  }
}

// GET: Get pending orders summary by date
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    let query = supabase
      .from('orders')
      .select(`
        delivery_date,
        status,
        total_amount
      `)
      .eq('status', 'pending')
      .order('delivery_date')

    if (startDate) query = query.gte('delivery_date', startDate)
    if (endDate) query = query.lte('delivery_date', endDate)

    const { data: orders, error } = await query

    if (error) throw error

    // Group by delivery date
    const grouped = (orders || []).reduce((acc: any, order) => {
      const date = order.delivery_date
      if (!acc[date]) {
        acc[date] = {
          delivery_date: date,
          count: 0,
          total_amount: 0
        }
      }
      acc[date].count += 1
      acc[date].total_amount += order.total_amount || 0
      return acc
    }, {})

    return NextResponse.json({ 
      success: true, 
      pending_by_date: Object.values(grouped)
    })

  } catch (error: any) {
    console.error('❌ GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}