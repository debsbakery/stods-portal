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

    // ✅ INCLUDES PO & DOCKET NUMBERS
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        total_amount,
        delivery_date,
        invoice_number,
        created_at,
        notes,
        purchase_order_number,
        docket_number,
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

    // Update order statuses to 'invoiced'
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

    const totalAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

    // ✅ SEND DETAILED INVOICE EMAILS
    let emailsSent = 0
    const emailErrors: string[] = []
    
    if (sendEmails) {
      console.log('📧 Sending detailed invoice emails...')
      
      for (const order of orders) {
        try {
          const customer = order.customers as any
          
          if (!customer?.email) {
            console.warn(`  ⚠️ No email for order ${order.id}`)
            continue
          }
          
          const updatedOrder = updatedOrders?.find(u => u.id === order.id)
          const invoiceNumber = updatedOrder?.invoice_number 
            ? String(updatedOrder.invoice_number).padStart(6, '0')
            : `TEMP-${order.id.slice(0, 8).toUpperCase()}`
          
          const paymentTerms = customer.payment_terms || 30
          const dueDate = new Date(delivery_date)
          dueDate.setDate(dueDate.getDate() + paymentTerms)
          
          // Calculate totals
          const subtotal = (order.order_items as any[]).reduce((sum, item) => sum + item.subtotal, 0)
          const gstTotal = (order.order_items as any[]).reduce((sum, item) => {
            const hasGST = item.gst_applicable !== false
            return sum + (hasGST ? item.subtotal * 0.1 : 0)
          }, 0)
          const total = subtotal + gstTotal
          
          // Build line items HTML
          const lineItemsHtml = (order.order_items as any[])
            .map(item => {
              const product = item.products || {}
              const hasGST = item.gst_applicable !== false
              
              return `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd;">${product.product_code || 'N/A'}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd;">${product.name || 'Unknown Product'}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">$${item.unit_price.toFixed(2)}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${hasGST ? 'Yes' : 'No'}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">$${item.subtotal.toFixed(2)}</td>
                </tr>
              `
            })
            .join('')
          
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery-portal.vercel.app'
          
          // ✅ FIXED TEMPLATE LITERAL + ADDED PO/DOCKET
          await sendEmail({
            to: customer.email,
            subject: `Invoice ${invoiceNumber} - Deb's Bakery`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 700px; margin: 0 auto; }
                  .header { background: #006A4E; color: white; padding: 30px; text-align: center; }
                  .content { padding: 30px; background: #f9f9f9; }
                  .card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                  .invoice-table th { background: #333; color: white; padding: 12px; text-align: left; font-size: 13px; }
                  .invoice-table td { padding: 10px; border-bottom: 1px solid #ddd; font-size: 13px; }
                  .totals { text-align: right; margin: 20px 0; }
                  .totals-row { display: flex; justify-content: flex-end; gap: 20px; margin: 8px 0; font-size: 14px; }
                  .total-grand { font-size: 1.3em; font-weight: bold; color: #CE1126; padding-top: 10px; border-top: 2px solid #333; }
                  .btn { display: inline-block; background: #006A4E; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 8px; }
                  .btn-secondary { background: #CE1126; }
                  .footer { text-align: center; padding: 20px; color: #666; font-size: 13px; border-top: 1px solid #ddd; margin-top: 30px; }
                  .reference-box { background: #f8f9fa; padding: 10px; border-left: 4px solid #006A4E; margin: 10px 0; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1 style="margin: 0; font-size: 32px;">🥖 Deb's Bakery</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">Tax Invoice</p>
                  </div>
                  
                  <div class="content">
                    <div class="card">
                      <h2 style="color: #006A4E; margin-top: 0;">Invoice #${invoiceNumber}</h2>
                      
                      ${order.purchase_order_number || order.docket_number ? `
                      <div class="reference-box">
                        ${order.purchase_order_number ? `<p style="margin: 5px 0;"><strong>📋 PO Number:</strong> ${order.purchase_order_number}</p>` : ''}
                        ${order.docket_number ? `<p style="margin: 5px 0;"><strong>🧾 Docket Number:</strong> ${order.docket_number}</p>` : ''}
                      </div>
                      ` : ''}
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                        <div>
                          <p style="margin: 5px 0;"><strong>Bill To:</strong></p>
                          <p style="margin: 5px 0; font-size: 15px; font-weight: bold;">${customer.business_name || 'N/A'}</p>
                          ${customer.contact_name ? `<p style="margin: 5px 0;">Attn: ${customer.contact_name}</p>` : ''}
                          ${customer.address ? `<p style="margin: 5px 0;">${customer.address}</p>` : ''}
                          ${customer.phone ? `<p style="margin: 5px 0;">📞 ${customer.phone}</p>` : ''}
                          ${customer.abn ? `<p style="margin: 5px 0;"><strong>ABN:</strong> ${customer.abn}</p>` : ''}
                        </div>
                        <div style="text-align: right;">
                          <p style="margin: 5px 0;"><strong>Invoice Date:</strong> ${new Date(delivery_date).toLocaleDateString('en-AU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</p>
                          <p style="margin: 5px 0;"><strong>Delivery Date:</strong> ${new Date(delivery_date).toLocaleDateString('en-AU', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</p>
                          <p style="margin: 5px 0;"><strong>Payment Due:</strong> ${dueDate.toLocaleDateString('en-AU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</p>
                          <p style="margin: 5px 0; color: #666;">(${paymentTerms} days)</p>
                        </div>
                      </div>
                    </div>

                    ${order.notes ? `
                    <div class="card" style="background: #fffbeb; border-left: 4px solid #f59e0b;">
                      <p style="margin: 0; font-weight: bold; color: #92400e;">📝 Order Notes:</p>
                      <p style="margin: 10px 0 0 0;">${order.notes}</p>
                    </div>
                    ` : ''}

                    <div class="card">
                      <h3 style="margin-top: 0;">Order Details</h3>
                      <table class="invoice-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Product</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Unit Price</th>
                            <th style="text-align: center;">GST</th>
                            <th style="text-align: right;">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${lineItemsHtml}
                        </tbody>
                      </table>

                      <div class="totals">
                        <div class="totals-row">
                          <strong>Subtotal:</strong>
                          <span>$${subtotal.toFixed(2)}</span>
                        </div>
                        <div class="totals-row">
                          <strong>GST (10%):</strong>
                          <span>$${gstTotal.toFixed(2)}</span>
                        </div>
                        <div class="totals-row total-grand">
                          <strong>TOTAL:</strong>
                          <span>$${total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${siteUrl}/api/invoice/${order.id}" 
                         target="_blank" 
                         rel="noopener"
                         class="btn">
                        👁️ View Invoice Online
                      </a>
                      <a href="${siteUrl}/api/invoice/${order.id}?download=true" 
                         download="invoice-${invoiceNumber}.pdf"
                         class="btn btn-secondary">
                        📥 Download PDF
                      </a>
                    </div>

                    <div class="card" style="background: #f0fdf4;">
                      <h3 style="margin-top: 0; color: #166534;">💳 Payment Information</h3>
                      <ul style="line-height: 2;">
                        <li><strong>Bank Transfer:</strong> BSB 123-456, Account 78901234</li>
                        <li><strong>Cash/Cheque:</strong> At delivery or in person</li>
                        <li><strong>Reference:</strong> ${invoiceNumber}</li>
                      </ul>
                      <p style="margin: 15px 0 0 0; padding: 15px; background: white; border-radius: 5px; border-left: 4px solid #16a34a;">
                        <strong>📅 Payment Due:</strong> ${dueDate.toLocaleDateString('en-AU', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>

                    <div class="footer">
                      <p style="margin: 5px 0;"><strong>Deb's Bakery</strong></p>
                      <p style="margin: 5px 0;">📧 ${process.env.BAKERY_EMAIL || 'debs_bakery@outlook.com'}</p>
                      <p style="margin: 5px 0;">📞 ${process.env.BAKERY_PHONE || '(04) 1234-5678'}</p>
                      <p style="margin: 15px 0 5px 0; font-size: 11px; color: #999;">
                        This is a Tax Invoice for GST purposes. Total includes GST of $${gstTotal.toFixed(2)} where applicable.
                      </p>
                      <p style="margin: 5px 0; font-size: 11px; color: #999;">
                        Generated: ${new Date().toLocaleString('en-AU')}
                      </p>
                    </div>
                  </div>
                </div>
              </body>
              </html>
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