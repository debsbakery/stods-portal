import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email-sender';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { orderId, customerEmail, businessName, deliveryDate, total } = await request.json();

    console.log('📧 Sending order confirmation emails for order:', orderId);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.STODS_SITE_URL ?? 'https://orders.stodsbakery.com';

    // ✅ Get full order details for admin email
    const supabase = await createClient();
    const { data: order } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          product_name,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .eq('id', orderId)
      .single();

    // Customer confirmation (unchanged)
    try {
      await sendEmail({
        to: customerEmail,
        subject: 'Order Confirmation - Stods Bakery',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #3E1F00;">Thank you for your order!</h1>
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

    // ✅ Admin notification with FULL order details
    try {
      // Build order items table
      const itemsTable = order?.order_items?.map((item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${item.subtotal.toFixed(2)}</td>
        </tr>
      `).join('') || '';

      await sendEmail({
        to: 'debs_bakery@outlook.com',
        subject: `🔔 New Order from ${businessName || customerEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <div style="background: #3E1F00; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">🛒 New Order Received</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Order #${orderId.slice(0, 8).toUpperCase()}</p>
            </div>
            
            <div style="padding: 30px; background: #f9f9f9;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin-top: 0; color: #333;">Customer Information</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; width: 140px;">Business:</td>
                    <td style="padding: 8px 0;">${businessName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Email:</td>
                    <td style="padding: 8px 0;">${customerEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Delivery Date:</td>
                    <td style="padding: 8px 0;">${new Date(deliveryDate).toLocaleDateString('en-AU', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</td>
                  </tr>
                  ${order?.notes ? `
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; vertical-align: top;">Notes:</td>
                    <td style="padding: 8px 0; font-style: italic; color: #666;">${order.notes}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin-top: 0; color: #333;">Order Items</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f5f5f5;">
                      <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
                      <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; width: 80px;">Qty</th>
                      <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd; width: 100px;">Price</th>
                      <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd; width: 100px;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsTable}
                  </tbody>
                  <tfoot>
                    <tr style="background: #f5f5f5; font-weight: bold;">
                      <td colspan="3" style="padding: 12px; text-align: right; font-size: 1.1em;">Order Total:</td>
                      <td style="padding: 12px; text-align: right; color: #C4A882; font-size: 1.2em;">$${total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style="text-align: center; margin-top: 30px;">
                <a href="${siteUrl}/admin/orders" 
                   style="display: inline-block; background: #C4A882; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  📋 View in Admin Portal
                </a>
              </div>
            </div>

            <div style="padding: 15px; text-align: center; font-size: 12px; color: #999; background: #f0f0f0; border-radius: 0 0 8px 8px;">
              Received at ${new Date().toLocaleString('en-AU')}
            </div>
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