import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  html,
  from,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  try {
    const fromAddress = from
      ?? `${process.env.RESEND_FROM_NAME ?? 'Stods Bakery'} <${process.env.RESEND_FROM_EMAIL ?? 'orders@stodsbakery.com'}>`

    console.log('📧 Sending email:', {
      from: fromAddress,
      to,
      subject: subject.substring(0, 50),
      htmlLength: html.length,
    })

    const { data, error } = await resend.emails.send({
      from:    fromAddress,
      to,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': crypto.randomUUID(),
      },
      tags: [
        { name: 'category', value: 'invoice' }
      ],
    })

    if (error) {
      console.error('❌ Resend API error:', error)
      throw error
    }

    console.log('✅ Email sent successfully:', { to, emailId: data?.id })
    return { success: true, emailId: data?.id }

  } catch (error: any) {
    console.error('❌ Email sending failed:', error)
    throw error
  }
}