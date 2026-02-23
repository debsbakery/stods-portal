import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email-sender';

export async function POST(request: NextRequest) {
  try {
    const { orderId, customerEmail, businessName, deliveryDate, total } = await request.json();

    console.log('📧 Sending order confirmation emails for order:', orderId);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery-portal.vercel.app';

    // Customer confirmation
    try {
      await sendEmail({
        to: customerEmail,
        subject: 'Order Confirmation - Debs Bakery',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #006A4E;">Thank you for your order!</h1>
            <p><strong>Order #${orderId.slice(0, 8).toUpperCase()}</strong></p>
            <p>Delivery Date: ${new Date(deliveryDate).toLocaleDateString('en-AU', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
            <p><strong>Total: $${total.toFixed(2)}</strong></p>
            <hr>
            <p>We'll send you another email when your order is out for delivery.</p>
            <p>View your order anytime in the <a href="${siteUrl}/portal">Customer Portal</a></p>
          </div>
        `,
      });
      console.log('✅ Customer email sent');
    } catch (error) {
      console.error('❌ Customer email failed:', error);
    }

    // Admin notification
    try {
      await sendEmail({
        to: 'debs_bakery@outlook.com',
        subject: `New Order from ${businessName || customerEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h1>New Order Received</h1>
            <p><strong>Order #${orderId.slice(0, 8).toUpperCase()}</strong></p>
            <p><strong>Customer:</strong> ${businessName || 'N/A'}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Delivery:</strong> ${new Date(deliveryDate).toLocaleDateString('en-AU')}</p>
            <p><strong>Total:</strong> $${total.toFixed(2)}</p>
            <hr>
            <p><a href="${siteUrl}/admin" style="background: #006A4E; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Admin Portal</a></p>
          </div>
        `,
      });
      console.log('✅ Admin email sent');
    } catch (error) {
      console.error('❌ Admin email failed:', error);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending confirmation emails:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}