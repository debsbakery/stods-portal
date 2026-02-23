import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { items } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    console.log('📦 Shadow order creation started for user:', user.id);

    // Get customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, email, address, abn')
      .eq('id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    console.log('👤 Customer found:', {
      id: customer.id,
      business_name: customer.business_name,
      email: customer.email
    });

    // Get product details
    const productIds = items.map((item: any) => item.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, unit, gst_applicable')
      .in('id', productIds);

    // Calculate totals
    let subtotal = 0;
    let gst = 0;

    const orderItems = items.map((item: any) => {
      const product = products?.find((p) => p.id === item.product_id);
      if (!product) return null;

      const itemSubtotal = item.quantity * product.price;
      const itemGst = product.gst_applicable ? itemSubtotal * 0.1 : 0;

      subtotal += itemSubtotal;
      gst += itemGst;

      return {
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        subtotal: itemSubtotal,
        gst_applicable: product.gst_applicable,
      };
    }).filter(Boolean);

    const total = subtotal + gst;

    console.log('💰 Order totals calculated:', {
      subtotal,
      gst,
      total,
      itemCount: orderItems.length
    });

    // Create order
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: user.id,
        customer_email: customer.email,
        customer_business_name: customer.business_name,
        customer_address: customer.address,
        customer_abn: customer.abn,
        delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
        source: 'online',
        total_amount: total,
        notes: 'Ordered from usual items (shadow order)',
      })
      .select()
      .single();

    if (orderError) {
      console.error('❌ Order creation failed:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    console.log('✅ Order created:', newOrder.id);

    // Create order items
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItems.map((item: any) => ({
        ...item,
        order_id: newOrder.id,
      }))
    );

    if (itemsError) {
      console.error('❌ Order items creation failed:', itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    console.log('✅ Order items created:', orderItems.length);

    // ✅ Send confirmation emails
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery-portal.vercel.app';
      
      console.log('📧 Preparing to send emails...');
      console.log('📧 Customer email:', customer.email);

      // Import email helper
      const { sendEmail } = await import('@/lib/email-sender');

      // Customer confirmation
      try {
        await sendEmail({
          to: customer.email,
          subject: 'Order Confirmation - Debs Bakery',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #006A4E;">Thank you for your order!</h1>
              <p><strong>Order #${newOrder.id.slice(0, 8).toUpperCase()}</strong></p>
              <p>Delivery Date: ${new Date(newOrder.delivery_date).toLocaleDateString('en-AU', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
              <p><strong>Total: $${newOrder.total_amount.toFixed(2)}</strong></p>
              <hr>
              <p>We'll send you another email when your order is out for delivery.</p>
              <p>View your order anytime in the <a href="${siteUrl}/portal">Customer Portal</a></p>
            </div>
          `,
        });
        console.log('✅ Customer email sent successfully');
      } catch (error) {
        console.error('❌ Customer email failed:', error);
      }

      // Admin notification with full order details
const itemsTable = orderItems.map((item: any) => `
  <tr>
    <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name}</td>
    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price.toFixed(2)}</td>
    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${item.subtotal.toFixed(2)}</td>
  </tr>
`).join('');

await sendEmail({
  to: 'debs_bakery@outlook.com',
  subject: `🔔 New Shadow Order from ${customer.business_name || customer.email}`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #006A4E; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🛒 New Order Received (Shadow Order)</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Order #${newOrder.id.slice(0, 8).toUpperCase()}</p>
      </div>
      
      <div style="padding: 30px; background: #f9f9f9;">
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin-top: 0; color: #333;">Customer Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px;">Business:</td>
              <td style="padding: 8px 0;">${customer.business_name || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0;">${customer.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Delivery Date:</td>
              <td style="padding: 8px 0;">${new Date(newOrder.delivery_date).toLocaleDateString('en-AU', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</td>
            </tr>
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
                <td style="padding: 12px; text-align: right; color: #CE1126; font-size: 1.2em;">$${total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${siteUrl}/admin/orders" 
             style="display: inline-block; background: #CE1126; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
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