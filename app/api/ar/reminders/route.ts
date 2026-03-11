export const dynamic = 'force-dynamic'

// app/api/ar/reminders/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'


const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")

export async function POST() {
  const supabase = await createClient()
  try {
    console.log('📧 Processing overdue reminders...')

    const today = new Date().toISOString().split('T')[0]

    // Find all overdue unpaid invoices
    const { data: overdueTransactions, error } = await supabase
      .from('ar_transactions')
      .select('*, customers(id, email, business_name, balance, contact_name)')
      .eq('type', 'invoice')
      .is('paid_date', null)
      .lt('due_date', today)
      .order('due_date', { ascending: true })

    if (error) throw error

    // Group by customer
    const customerOverdue = new Map<string, {
      customer: any
      invoices: any[]
      totalOverdue: number
    }>()

    for (const tx of overdueTransactions || []) {
      const custId = tx.customer_id
      if (!customerOverdue.has(custId)) {
        customerOverdue.set(custId, {
          customer: tx.customers,
          invoices: [],
          totalOverdue: 0,
        })
      }
      const entry = customerOverdue.get(custId)!
      entry.invoices.push(tx)
      entry.totalOverdue += parseFloat(tx.amount)
    }

    let sent = 0
    const errors: string[] = []

    for (const [customerId, data] of customerOverdue) {
      try {
        const { customer, invoices, totalOverdue } = data

        if (!customer?.email) continue

        // Check if we sent a reminder recently (within 7 days)
        const { data: recentEmail } = await supabase
          .from('ar_emails')
          .select('id')
          .eq('customer_id', customerId)
          .eq('type', 'overdue_reminder')
          .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle()

        if (recentEmail) {
          console.log(`  ⏭️ Skipping ${customer.business_name} - reminded recently`)
          continue
        }

        // Build invoice list for email
        const invoiceLines = invoices
          .map((inv) => {
            const daysOverdue = Math.floor(
              (new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
            )
            return `• ${inv.description} — $${parseFloat(inv.amount).toFixed(2)} (${daysOverdue} days overdue)`
          })
          .join('\n')

        // Send email
        const { error: emailError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: customer.email,
          subject: `Overdue Payment Reminder — $${totalOverdue.toFixed(2)} Outstanding`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #C4A882; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Stods Bakery</h1>
                <p style="margin: 5px 0 0 0;">Payment Reminder</p>
              </div>
              
              <div style="padding: 30px; background: #f9f9f9;">
                <p>Dear ${customer.contact_name || customer.business_name || 'Valued Customer'},</p>
                
                <p>This is a friendly reminder that you have outstanding invoices totalling 
                <strong style="color: #C4A882;">$${totalOverdue.toFixed(2)}</strong>.</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">Overdue Invoices:</h3>
                  <pre style="font-family: Arial; white-space: pre-wrap;">${invoiceLines}</pre>
                </div>
                
                <p>Please arrange payment at your earliest convenience. If you have already made 
                payment, please disregard this reminder.</p>
                
                <p>If you have any questions, please don't hesitate to contact us:</p>
                <ul>
                  <li>📧 ${process.env.BAKERY_EMAIL}</li>
                  <li>📞 ${process.env.BAKERY_PHONE}</li>
                </ul>
                
                <p>Thank you for your business!</p>
                <p><strong>Stods Bakery</strong><br/>
                ${process.env.BAKERY_ADDRESS}</p>
              </div>
            </div>
          `,
        })

        if (emailError) {
          errors.push(`${customer.business_name}: ${emailError.message}`)
          continue
        }

        // Log email sent
        await supabase.from('ar_emails').insert({
          customer_id: customerId,
          type: 'overdue_reminder',
          subject: `Overdue Payment Reminder — $${totalOverdue.toFixed(2)}`,
          status: 'sent',
        })

        sent++
        console.log(
          `  📧 Reminder sent to ${customer.business_name} (${customer.email}) — $${totalOverdue.toFixed(2)}`
        )
      } catch (err: any) {
        errors.push(`${customerId}: ${err.message}`)
      }
    }

    console.log(`✅ Sent ${sent} reminders, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      sent,
      totalCustomersOverdue: customerOverdue.size,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('❌ Reminder processing error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
