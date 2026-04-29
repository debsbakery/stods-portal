const FROM_NAME  = process.env.RESEND_FROM_NAME  || "Stods Bakery";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "orders@stodsbakery.com";

export const emailConfig = {
  fromAddress: `${FROM_NAME} <${FROM_EMAIL}>`,
  replyTo: process.env.RESEND_REPLY_TO || FROM_EMAIL,
  bakeryEmail: process.env.BAKERY_EMAIL || "orders@stodsbakery.com",
  bakeryName: process.env.BAKERY_NAME || FROM_NAME,
  portalUrl: process.env.NEXT_PUBLIC_APP_URL || "https://stods-portal.vercel.app",
};