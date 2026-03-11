import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")

const BAKERY_NAME = process.env.BAKERY_NAME || "Stods Bakery"
const BAKERY_EMAIL = process.env.BAKERY_EMAIL || 'noreply@example.com'
const BAKERY_PHONE = process.env.BAKERY_PHONE || ''
const BAKERY_ADDRESS = process.env.BAKERY_ADDRESS || ''
const BAKERY_ABN = process.env.BAKERY_ABN || ''

// Resend requires a verified domain. For testing, use 'onboarding@resend.dev'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || `${BAKERY_NAME} <onboarding@resend.dev>`

/**
 * Send account statement with PDF attachment
 */
export async function sendStatementEmail(data: {
  customer: any
  pdfBuffer: Buffer
  summary: { previousBalance: number; totalCharges: number; totalCredits: number; currentBalance: number }
}) {
  const { customer, pdfBuffer, summary } = data
  const customerName = customer.business_name || customer.contact_name || customer.email

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-bottom: 3px solid #007bff; }
        .summary { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .balance { font-size: 22px; font-weight: bold; color: #d9534f; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">${BAKERY_NAME}</h2>
          <p style="margin: 5px 0 0 0;">ABN: ${BAKERY_ABN}</p>
        </div>

        <div style="padding: 20px;">
          <p>Dear ${customerName},</p>
          <p>Please find attached your account statement.</p>

          <div class="summary">
            <p style="margin: 0;"><strong>Previous Balance:</strong> $${summary.previousBalance.toFixed(2)}</p>
            <p style="margin: 0;"><strong>Charges:</strong> $${summary.totalCharges.toFixed(2)}</p>
            <p style="margin: 0;"><strong>Payments:</strong> $${summary.totalCredits.toFixed(2)}</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 8px 0;">
            <p class="balance" style="margin: 0;">Balance Due: $${summary.currentBalance.toFixed(2)}</p>
          </div>

          <p>If you have any questions, please contact us at:</p>
          <p>
            <strong>Phone:</strong> ${BAKERY_PHONE}<br>
            <strong>Email:</strong> ${BAKERY_EMAIL}
          </p>

          <p>Thank you for your business!</p>
        </div>

        <div class="footer">
          <p>${BAKERY_NAME} | ${BAKERY_ADDRESS}</p>
          <p>ABN: ${BAKERY_ABN}</p>
        </div>
      </div>
    </body>
    </html>
  `

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: customer.email,
    subject: `Account Statement - ${new Date().toLocaleDateString('en-AU')}`,
    html: htmlContent,
    attachments: [
      {
        filename: `statement-${new Date().toISOString().split('T')[0]}.pdf`,
        content: pdfBuffer
      }
    ]
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }
}

/**
 * Send overdue reminder email (no PDF)
 */
export async function sendReminderEmail(customer: any, level: number) {
  const subjects: Record<number, string> = {
    1: 'Friendly Reminder: Payment Due',
    2: 'Second Notice: Payment Overdue',
    3: 'URGENT: Final Notice - Account Past Due'
  }

  const balance = parseFloat(customer.balance || 0)
  const customerName = customer.business_name || customer.contact_name || customer.email

  const messages: Record<number, string> = {
    1: `
      <p>This is a friendly reminder that your account has an outstanding balance.</p>
      <p><strong style="font-size: 18px; color: #d9534f;">Amount Due: $${balance.toFixed(2)}</strong></p>
      <p>We kindly request payment at your earliest convenience.</p>
    `,
    2: `
      <p>Our records indicate that your account balance is now overdue.</p>
      <p><strong style="font-size: 20px; color: #d9534f;">Outstanding Balance: $${balance.toFixed(2)}</strong></p>
      <p>Please remit payment immediately to avoid service interruption.</p>
    `,
    3: `
      <p style="color: #d9534f; font-weight: bold;">FINAL NOTICE - IMMEDIATE ACTION REQUIRED</p>
      <p>Your account is seriously past due.</p>
      <p><strong style="font-size: 22px; color: #c00;">TOTAL AMOUNT DUE: $${balance.toFixed(2)}</strong></p>
      <p style="background: #fff3cd; padding: 10px; border-left: 4px solid #ffc107;">
        <strong>⚠️ WARNING:</strong> Failure to pay within 5 business days may result in suspension of services.
      </p>
    `
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-bottom: 3px solid ${level === 3 ? '#dc3545' : '#007bff'}; }
        .content { padding: 20px; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">${BAKERY_NAME}</h2>
          <p style="margin: 5px 0 0 0;">ABN: ${BAKERY_ABN}</p>
        </div>

        <div class="content">
          <p>${level === 3 ? `ATTENTION: ${customerName}` : `Dear ${customerName},`}</p>
          ${messages[level]}

          <p>You can make payment by contacting us at:</p>
          <p><strong>Phone:</strong> ${BAKERY_PHONE}<br>
          <strong>Email:</strong> ${BAKERY_EMAIL}</p>

          <p>If you have already sent payment, please disregard this notice.</p>
        </div>

        <div class="footer">
          <p>${BAKERY_NAME} | ${BAKERY_ADDRESS}</p>
          <p>ABN: ${BAKERY_ABN}</p>
        </div>
      </div>
    </body>
    </html>
  `

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: customer.email,
    subject: subjects[level],
    html: htmlContent
  })

  if (error) {
    console.error('Resend reminder error:', error)
    throw new Error(`Failed to send reminder: ${error.message}`)
  }
}
