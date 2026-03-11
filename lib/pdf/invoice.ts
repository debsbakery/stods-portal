import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface InvoiceData {
  id: string
  order_number?: string
  delivery_date: string
  total_amount: number
  customer: {
    id: string
    business_name?: string
    contact_name?: string
email?: string
    address?: string
  }
  order_items: Array<{
    quantity: number
    price: number
    product: {
      name: string
      product_code?: string
    }
  }>
}

export async function generateInvoicePDF(order: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const formatCurrency = (amount: number | string) =>
    `$${parseFloat(amount.toString()).toFixed(2)}`

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
  }

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
  ) => {
    page.drawText(String(text), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(...opts.color) : rgb(0.2, 0.2, 0.2),
    })
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end:   { x: x2, y: y2 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })
  }

  let y = height - 50

  // ── Header ──────────────────────────────────────────────
  drawText("Stods Bakery", 50, y, { size: 24, bold: true, color: [0, 0.416, 0.306] })
  y -= 20
  drawText('TAX INVOICE', 50, y, { size: 10, color: [0.2, 0.2, 0.2] })

  // Invoice details top-right
  drawText(`Invoice #: ${order.order_number || order.id.slice(0, 8)}`, 350, height - 50, { size: 10 })
  drawText(`Date: ${formatDate(order.delivery_date)}`,                  350, height - 65, { size: 10 })

  // ── Customer ─────────────────────────────────────────────
  y -= 40
  drawText('Bill To:', 50, y, { size: 12, bold: true })
  y -= 18
  drawText(
    order.customer.business_name || order.customer.contact_name || order.customer.email || 'Customer',
    50, y, { size: 10 }
  )
  if (order.customer.address) { y -= 15; drawText(order.customer.address, 50, y, { size: 10 }) }
  if (order.customer.email)   { y -= 15; drawText(order.customer.email,   50, y, { size: 10 }) }

  y -= 20
  drawLine(50, y, width - 50, y)
  y -= 20

  // ── Table header ─────────────────────────────────────────
  drawText('Item',  50,  y, { size: 10, bold: true })
  drawText('Code',  280, y, { size: 10, bold: true })
  drawText('Qty',   370, y, { size: 10, bold: true })
  drawText('Price', 420, y, { size: 10, bold: true })
  drawText('Total', 490, y, { size: 10, bold: true })
  y -= 14
  drawLine(50, y, width - 50, y)
  y -= 16

  // ── Line items ───────────────────────────────────────────
  let subtotal = 0

  for (const item of order.order_items) {
    if (y < 100) {
      page = pdfDoc.addPage([595, 842])
      y = height - 50
    }

    const lineTotal = item.quantity * item.price
    subtotal += lineTotal

    // Truncate long product names
    const name = item.product.name.length > 35
      ? item.product.name.slice(0, 33) + '..'
      : item.product.name

    drawText(name,50,  y, { size: 9 })
    drawText(item.product.product_code || '-', 280, y, { size: 9 })
    drawText(item.quantity.toString(),          370, y, { size: 9 })
    drawText(formatCurrency(item.price),        420, y, { size: 9 })
    drawText(formatCurrency(lineTotal),         490, y, { size: 9 })
    y -= 18
  }

  // ── Totals ───────────────────────────────────────────────
  y -= 8
  drawLine(350, y, width - 50, y)
  y -= 18

  const gstAmount = subtotal * 0.1
  const total     = subtotal + gstAmount

  drawText('Subtotal:',  400, y, { size: 10 })
  drawText(formatCurrency(subtotal),  490, y, { size: 10 })
  y -= 18

  drawText('GST (10%):', 400, y, { size: 10 })
  drawText(formatCurrency(gstAmount), 490, y, { size: 10 })
  y -= 10

  drawLine(350, y, width - 50, y)
  y -= 18

  drawText('Total:', 400, y, { size: 12, bold: true })
  drawText(formatCurrency(total), 490, y, { size: 12, bold: true, color: [0, 0.416, 0.306] })

  // ── Footer ───────────────────────────────────────────────
  drawText('Payment Terms: Due on receipt', 50, 60, { size: 9, color: [0.4, 0.4, 0.4] })
  drawText('Thank you for your business!',  50, 45, { size: 9, color: [0.4, 0.4, 0.4] })
  drawText("Stods Bakery | ABN: 55 105 023 327", width / 2 - 80, 30, { size: 8, color: [0.5, 0.5, 0.5] })

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}