import { Resend } from 'resend';

const resend      = new Resend(process.env.RESEND_API_KEY)
const resendStods = new Resend(process.env.STODS_RESEND_API_KEY)

interface Attachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Attachment[];
}) {
  try {
    const fromAddress = from
      ?? `${process.env.RESEND_FROM_NAME ?? process.env.STODS_RESEND_FROM_NAME ?? "Stods Bakery"} <${process.env.RESEND_FROM_EMAIL ?? process.env.STODS_RESEND_FROM_EMAIL ?? 'orders@stodsbakery.com'}>`

    const isStods = fromAddress.toLowerCase().includes('stods')
    const client  = isStods ? resendStods : resend

    console.log('📧 Sending email:', {
      from:            fromAddress,
      to,
      subject:         subject.substring(0, 50),
      htmlLength:      html.length,
      attachmentCount: attachments?.length ?? 0,
    })

    const emailPayload: any = {
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
    }

    // Only include attachments if present (Resend SDK is strict about this)
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(a => ({
        filename:    a.filename,
        content:     a.content,
        contentType: a.contentType ?? 'application/octet-stream',
      }))
    }

    const { data, error } = await client.emails.send(emailPayload)

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