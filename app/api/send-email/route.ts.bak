export const dynamic = 'force-dynamic'

import { Resend } from 'resend';
import { emailConfig } from '@/lib/email-config'
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export async function POST(request: NextRequest) {
  try {
    console.log('📧 Send-email API route called');
    
    const body = await request.json();
    console.log('📧 Request body received:', {
      to: body.to,
      subject: body.subject?.substring(0, 50),
      hasHtml: !!body.html
    });

    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      console.error('🔴 Missing required fields:', { to: !!to, subject: !!subject, html: !!html });
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    console.log('📧 Attempting to send email via Resend:', {
      from: emailConfig.fromAddress,
      replyTo: emailConfig.replyTo,
      to,
      subject: subject.substring(0, 50)
    });

    const { data, error } = await resend.emails.send({
      from: emailConfig.fromAddress,
      replyTo: emailConfig.replyTo,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('❌ Resend API error:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error 
      }, { status: 500 });
    }

    console.log('✅ Email sent successfully:', {
      to,
      emailId: data?.id
    });

    return NextResponse.json({ 
      success: true, 
      emailId: data?.id,
      message: 'Email sent successfully'
    });

  } catch (error: any) {
    console.error('🔴 Send-email API error:', error);
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to send email',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
