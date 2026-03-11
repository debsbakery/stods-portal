import { PDFDocument } from 'pdf-lib'
import { generatePackingSlip } from './packing-slip'

export async function generateBatchPackingSlips(orders: any[]): Promise<Buffer> {
  const mergedPdf = await PDFDocument.create()

  const bakeryInfo = {
    name:    process.env.BAKERY_NAME    ?? "Stods Bakery",
    phone:   process.env.BAKERY_PHONE   ?? '(07) 4632 9475',
    address: process.env.BAKERY_ADDRESS ?? '20 Mann St, Toowoomba QLD 4350',
  }

  for (const order of orders) {
    try {
      // Map order data to match OrderWithItems shape
      const orderWithItems = {
        ...order,
        customer_business_name: order.customer_business_name || order.customer?.business_name || 'Customer',
        customer_email:         order.customer_email         || order.customer?.email         || '',
        customer_address:       order.customer_address       || order.customer?.address       || '',
        order_items: (order.order_items || []).map((item: any) => ({
          ...item,
          product_code: item.product?.code || item.product_code || '',
          product_name: item.product_name  || item.product?.name || '—',
          quantity:     item.quantity,})),
      }

      const invoiceNumber = order.invoice_number? String(order.invoice_number).padStart(6, '0')
        : undefined

      // Generate individual packing slip using your existing design
      const doc = await generatePackingSlip({
        order:        orderWithItems as any,
        bakeryInfo,
        invoiceNumber,
      })

      // Convert jsPDF to buffer then load into pdf-lib for merging
      const pdfBytes    = doc.output('arraybuffer')
      const slipPdf     = await PDFDocument.load(pdfBytes)
      const copiedPages = await mergedPdf.copyPages(slipPdf, slipPdf.getPageIndices())
      copiedPages.forEach((page) => mergedPdf.addPage(page))

    } catch (err) {
      console.error(`Failed to generate slip for order ${order.id}:`, err)// Continue with next order rather than failing entire batch
    }
  }

  const pdfBytes = await mergedPdf.save()
  return Buffer.from(pdfBytes)
}