export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

async function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

const resend = new Resend(process.env.RESEND_API_KEY!)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function getEmailSubject(severity: string, productName: string): string {
  switch (severity) {
    case 'critical':
      return `URGENT: Product Recall - ${productName}`
    case 'high':
      return `IMPORTANT: Product Recall Notice - ${productName}`
    case 'medium':
      return `Product Recall Notice - ${productName}`
    case 'low':
      return `Product Quality Notice - ${productName}`
    default:
      return `Product Recall - ${productName}`
  }
}

function buildRecallEmailHtml(
  recall: any,
  customer: any,
  affectedCustomer: any,
  bakeryConfig: any
): string {
   const severityColorMap: Record<string, string> = {
    critical: '#DC2626',
    high: '#EA580C',
    medium: '#D97706',
    low: '#65A30D',
  }
  const severityColor = severityColorMap[recall.severity] ?? '#6B7280'

  const severityLabel = recall.severity.toUpperCase()

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background-color: ${severityColor}; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: bold;">PRODUCT RECALL NOTICE</h1>
                  <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.95;">Severity: ${severityLabel}</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 30px;">
                  
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827;">
                    Dear ${customer.business_name || customer.contact_name || 'Valued Customer'},
                  </p>

                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827; line-height: 1.6;">
                    We are issuing this notice to inform you that the following product has been recalled:
                  </p>

                  <!-- Product Details Box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; margin: 0 0 20px 0;">
                    <tr>
                      <td style="padding: 20px;">
                        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #92400E;">Product: ${recall.product_name}</h2>
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #92400E;"><strong>Delivery Period:</strong> ${new Date(recall.date_from).toLocaleDateString('en-AU')} to ${new Date(recall.date_to).toLocaleDateString('en-AU')}</p>
                        <p style="margin: 0; font-size: 14px; color: #92400E;"><strong>Affected Value:</strong> $${affectedCustomer.total_affected_value.toFixed(2)}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Reason -->
                  <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #111827;">Reason for Recall:</h3>
                  <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                    ${recall.reason}
                  </p>

                  <!-- Action Required -->
                  <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #111827;">What You Should Do:</h3>
                  <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 15px; color: #374151; line-height: 1.8;">
                    <li><strong>Do not use or distribute</strong> the affected product</li>
                    <li>Check your inventory and remove any remaining stock</li>
                    <li>Contact us immediately if you have sold or used this product</li>
                    <li>We will arrange collection or disposal instructions</li>
                  </ul>

                  <!-- Contact -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; border-radius: 6px; margin: 20px 0 0 0;">
                    <tr>
                      <td style="padding: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #111827;">Contact Us:</h3>
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
                          <strong>Phone:</strong> ${bakeryConfig.phone}
                        </p>
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
                          <strong>Email:</strong> ${bakeryConfig.email}
                        </p>
                        <p style="margin: 0; font-size: 14px; color: #6B7280; font-style: italic;">
                          Please contact us as soon as possible to arrange remediation.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 20px 0 0 0; font-size: 14px; color: #6B7280;">
                    We sincerely apologize for any inconvenience this may cause. Your safety and satisfaction are our highest priorities.
                  </p>

                  <p style="margin: 20px 0 0 0; font-size: 14px; color: #6B7280;">
                    Best regards,<br>
                    <strong>${bakeryConfig.name}</strong>
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #E5E7EB;">
                  <p style="margin: 0; font-size: 12px; color: #6B7280;">
                    ${bakeryConfig.name}<br>
                    ${bakeryConfig.address}<br>
                    ABN: ${bakeryConfig.abn}
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

// POST - Send recall notifications
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params
    const body = await request.json()
    const { customer_ids } = body // Optional: send to specific customers only

    // Get recall details
    const { data: recall, error: recallError } = await supabase
      .from('product_recalls')
      .select('*')
      .eq('id', id)
      .single()

    if (recallError) throw recallError

    // Get affected customers to notify
    let query = supabase
      .from('recall_affected_customers')
      .select(`
        *,
        customers (
          id,
          business_name,
          contact_name,
          email,
          email_2
        )
      `)
      .eq('recall_id', id)
      .is('notification_sent_at', null)

    if (customer_ids && customer_ids.length > 0) {
      query = query.in('customer_id', customer_ids)
    }

    const { data: affectedCustomers, error: customersError } = await query

    if (customersError) throw customersError

    if (!affectedCustomers || affectedCustomers.length === 0) {
      return NextResponse.json({ 
        message: 'No customers to notify',
        sent_count: 0 
      })
    }

    // Bakery config
       const bakeryConfig = {
      name: process.env.BAKERY_NAME ?? '',
      email: process.env.BAKERY_EMAIL ?? '',
      phone: process.env.BAKERY_PHONE ?? '',
      address: process.env.BAKERY_ADDRESS ?? '',
      abn: process.env.BAKERY_ABN ?? '',
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? bakeryConfig.email
    const fromName = process.env.RESEND_FROM_NAME ?? bakeryConfig.name

    let sentCount = 0
    const errors = []

    // Send emails
    for (const affectedCustomer of affectedCustomers) {
      const customer = affectedCustomer.customers

      if (!customer || !customer.email) {
        errors.push({ customer_id: affectedCustomer.customer_id, error: 'No email address' })
        continue
      }

      try {
        const subject = getEmailSubject(recall.severity, recall.product_name)
        const html = buildRecallEmailHtml(recall, customer, affectedCustomer, bakeryConfig)

        // Send to primary email
        await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: customer.email,
          subject,
          html,
        })

        // Send to secondary email if exists
        if (customer.email_2) {
          await sleep(400) // Rate limit protection
          await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: customer.email_2,
            subject,
            html,
          })
        }

        // Update notification timestamp
        await supabase
          .from('recall_affected_customers')
          .update({
            notification_sent_at: new Date().toISOString(),
            notification_method: 'email',
          })
          .eq('id', affectedCustomer.id)

        sentCount++
        await sleep(400) // Rate limit between customers

      } catch (emailError: any) {
        console.error(`Failed to send to ${customer.email}:`, emailError)
        errors.push({ 
          customer_id: affectedCustomer.customer_id, 
          email: customer.email,
          error: emailError.message 
        })
      }
    }

    // Update recall status
    if (sentCount > 0) {
      await supabase
        .from('product_recalls')
        .update({ status: 'notifying' })
        .eq('id', id)
    }

    return NextResponse.json({
      message: `Notifications sent to ${sentCount} customer(s)`,
      sent_count: sentCount,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error: any) {
    console.error('Error sending recall notifications:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}