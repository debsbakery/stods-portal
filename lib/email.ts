import { Resend } from "resend";
import { OrderWithItems } from "./types";
import { formatCurrency, formatDate } from "./utils";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

interface SendOrderEmailsParams {
  order: OrderWithItems;
  customerEmail: string;
}

export async function sendOrderEmails({ 
  order, 
  customerEmail 
}: SendOrderEmailsParams) {
  const bakeryEmail = process.env.BAKERY_EMAIL || "debs_bakery@outlook.com";
  const bakeryName = process.env.BAKERY_NAME || "Stods Bakery";
  
  // Build order items HTML
  const orderItemsHtml = order.order_items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.product_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.subtotal)}</td>
      </tr>
    `
    )
    .join("");

  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #8B4513 0%, #D2691E 100%); padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">🍞 ${bakeryName}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Wholesale Order Confirmation</p>
      </div>
      
      <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #8B4513; margin-top: 0;">Order #${order.id.slice(0, 8).toUpperCase()}</h2>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0;"><strong>Customer:</strong> ${order.customer_business_name || customerEmail}</p>
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${customerEmail}</p>
          <p style="margin: 0 0 10px 0;"><strong>Delivery Date:</strong> ${formatDate(order.delivery_date)}</p>
          <p style="margin: 0;"><strong>Status:</strong> <span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 14px;">Pending</span></p>
        </div>

        ${order.notes ? `
        <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-weight: 600; color: #92400e;">📝 Order Notes:</p>
          <p style="margin: 10px 0 0 0;">${order.notes}</p>
        </div>
        ` : ''}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Product</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${orderItemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px;">Total:</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #8B4513;">${formatCurrency(order.total_amount || 0)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin-top: 20px;">
  <p style="margin: 0; color: #075985;">
    <strong>✅ Order Confirmed</strong><br>
    We've received your order and will begin preparing your fresh bread for delivery on ${formatDate(order.delivery_date)}.
  </p>
</div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">
          Questions? Contact us at ${bakeryEmail}
        </p>
      </div>
    </body>
    </html>
  `;

  try {
    console.log("📧 Sending emails...");
    
    // Send to customer
    console.log("📧 Sending to customer:", customerEmail);
    const customerResponse = await resend.emails.send({
      from: `${bakeryName} <onboarding@resend.dev>`,
      to: customerEmail,
      subject: `Order Confirmation #${order.id.slice(0, 8).toUpperCase()} - ${bakeryName}`,
      html: emailTemplate,
    });

    console.log("✅ Customer email sent:", customerResponse);

    // Send to bakery
    console.log("📧 Sending to bakery:", bakeryEmail);
    const bakeryResponse = await resend.emails.send({
      from: `${bakeryName} Orders <onboarding@resend.dev>`,
      to: bakeryEmail,
      subject: `🍞 New Order #${order.id.slice(0, 8).toUpperCase()} from ${order.customer_business_name || customerEmail}`,
      html: emailTemplate.replace('Order Confirmation', 'New Order Received'),
    });

    console.log("✅ Bakery email sent:", bakeryResponse);

    return { success: true, customerResponse, bakeryResponse };
  } catch (error) {
    console.error("🔴 Email error:", error);
    throw error;
  }
}
