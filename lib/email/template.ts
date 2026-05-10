export interface OrderConfirmationData {
  orderNumber: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  portalLink: string;
}

export function orderConfirmationTemplate(data: OrderConfirmationData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${item.quantity}x ${item.name}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        $${item.price.toFixed(2)}
      </td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation - Stods Bakery</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #3E1F00 0%, #004d38 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">🥖 Stods Bakery</h1>
                  </td>
                </tr>

                <!-- Thank You Message -->
                <tr>
                  <td style="padding: 30px;">
                    <h2 style="color: #111827; margin: 0 0 10px 0;">Thank You for Your Order!</h2>
                    <p style="color: #6b7280; margin: 0;">Hi ${data.customerName}, we've received your order and it's being prepared with care.</p>
                  </td>
                </tr>

                <!-- Order Details -->
                <tr>
                  <td style="padding: 0 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px;">
                      <tr>
                        <td style="padding: 15px; background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                          <strong style="color: #374151;">Order #${data.orderNumber}</strong>
                          <br>
                          <span style="color: #6b7280; font-size: 14px;">${data.orderDate}</span>
                        </td>
                      </tr>
                      ${itemsHtml}
                      <tr>
                        <td style="padding: 12px; text-align: right; color: #6b7280;">Subtotal</td>
                        <td style="padding: 12px; text-align: right;"><strong>$${data.subtotal.toFixed(2)}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; text-align: right; color: #6b7280;">Tax</td>
                        <td style="padding: 12px; text-align: right;"><strong>$${data.tax.toFixed(2)}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding: 15px; text-align: right; background-color: #f9fafb; border-top: 2px solid #e5e7eb; font-size: 18px;">
                          <strong style="color: #3E1F00;">Total</strong>
                        </td>
                        <td style="padding: 15px; text-align: right; background-color: #f9fafb; border-top: 2px solid #e5e7eb; font-size: 18px;">
                          <strong style="color: #3E1F00;">$${data.total.toFixed(2)}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Delivery Info -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="background-color: #ecfdf5; border-left: 4px solid #3E1F00; padding: 15px; border-radius: 4px;">
                      <strong style="color: #3E1F00;">📅 Delivery Date:</strong>
                      <span style="color: #374151;">${data.deliveryDate}</span>
                    </div>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding: 20px 30px; text-align: center;">
                    <a href="${data.portalLink}" style="display: inline-block; background-color: #3E1F00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                      View Order Details
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; text-align: center; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
                    <p style="color: #6b7280; margin: 0; font-size: 14px;">
                      Questions? Reply to this email or contact us at debs_bakery@outlook.com
                    </p>
                    <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 12px;">
                      © 2026 Stods Bakery. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export interface NewOrderNotificationData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  deliveryDate: string;
  itemCount: number;
  total: number;
  adminLink: string;
}

export function newOrderNotificationTemplate(data: NewOrderNotificationData): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>New Order Received - Stods Bakery</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                
                <tr>
                  <td style="background-color: #1f2937; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">🔔 New Order Received</h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 30px;">
                    <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
                      A new order has been placed:
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; padding: 20px;">
                      <tr>
                        <td style="padding: 8px 0;"><strong>Order Number:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">#${data.orderNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Customer:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">${data.customerName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Email:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">${data.customerEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Order Date:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">${data.orderDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Delivery Date:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">${data.deliveryDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Items:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">${data.itemCount}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb; font-size: 18px;">
                          <strong style="color: #3E1F00;">Total:</strong>
                        </td>
                        <td style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb; text-align: right; font-size: 18px;">
                          <strong style="color: #3E1F00;">$${data.total.toFixed(2)}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 0 30px 30px 30px; text-align: center;">
                    <a href="${data.adminLink}" style="display: inline-block; background-color: #1f2937; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                      View in Admin Portal
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}