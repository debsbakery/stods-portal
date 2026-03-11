export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: memo, error } = await supabase
    .from('credit_memos')
    .select(`
      *,
      customer:customers(id, business_name, contact_name, email),
      items:credit_memo_items(*)
    `)
    .eq('id', id)
    .single()

  if (error || !memo) {
    return NextResponse.json({ error: 'Credit memo not found' }, { status: 404 })
  }

  if (!memo.customer.email) {
    return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })
  }

  // Generate PDF
  const pdfRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/credit-memos/${id}/pdf`)
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())

  const customerName = memo.customer.business_name || memo.customer.contact_name || 'Valued Customer'
  const creditType   = memo.credit_type === 'stale_return' ? 'Stale Return Credit' : 'Product Credit'
  const total        = Math.abs(parseFloat(memo.total_amount || memo.amount || '0'))

  const { error: emailError } = await resend.emails.send({
    from: "Stods Bakery <noreply@debsbakery.store>",
    to:   memo.customer.email,
    subject: `Credit Invoice ${memo.credit_number} — Stods Bakery`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3E1F00;">Credit Invoice</h2>
        <p>Dear ${customerName},</p>
        <p>Please find attached your credit invoice for <strong>${creditType}</strong>.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Credit Invoice #:</strong> ${memo.credit_number}</p>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${creditType}</p>
          <p style="margin: 5px 0;"><strong>Total Credit:</strong> $${total.toFixed(2)}</p>
          ${memo.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${memo.notes}</p>` : ''}
        </div>
        <p>This credit has been applied to your account balance.</p>
        <p>Thank you,<br/><strong style="color: #3E1F00;">Stods Bakery</strong></p>
      </div>
    `,
    attachments: [{
      filename: `credit-invoice-${memo.credit_number}.pdf`,
      content:  pdfBuffer,
    }],
  })

  if (emailError) {
    return NextResponse.json({ error: emailError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
