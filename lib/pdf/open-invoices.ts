// lib/pdf/open-invoices.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface OpenInvoice {
  date: string
  due_date: string | null
  reference: string
  description: string
  amount: number
  amount_paid: number
  outstanding: number
  status: 'unpaid' | 'partial'
}

interface OpenInvoicesData {
  customer: {
    business_name?: string
    contact_name?: string
    email?: string
    address?: string
    payment_terms?: string
  }
  invoices: OpenInvoice[]
  totalOutstanding: number
  asAt: string
}

export async function generateOpenInvoicesPDF(data: OpenInvoicesData): Promise<Buffer> {
  const { customer, invoices, totalOutstanding, asAt } = data

  const pdfDoc  = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const GREEN: [number, number, number] = [0, 0.416, 0.306]
  const RED:   [number, number, number] = [0.808, 0.067, 0.149]
  const AMBER: [number, number, number] = [0.8, 0.5, 0.0]
  const GREY:  [number, number, number] = [0.4, 0.4, 0.4]
  const DARK:  [number, number, number] = [0.15, 0.15, 0.15]
  const RIGHT_MARGIN = width - 50

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (d: string | null) => {
    if (!d) return '—'
    const dt = new Date(d)
    return [
      dt.getDate().toString().padStart(2, '0'),
      (dt.getMonth() + 1).toString().padStart(2, '0'),
      dt.getFullYear(),
    ].join('/')
  }

  const isOverdue = (due: string | null) => {
    if (!due) return false
    return new Date(due) < new Date()
  }

  // Header bar
  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: rgb(...GREEN) })
  page.drawText("stods bakeryBakery", {
    x: 50, y: height - 35, size: 22, font: fontBold, color: rgb(1, 1, 1),
  })
  page.drawText('OPEN INVOICE STATEMENT', {
    x: 50, y: height - 55, size: 9, font, color: rgb(0.8, 1, 0.9),
  })
  page.drawText(`As at: ${fmtDate(asAt)}`, {
    x: RIGHT_MARGIN - 150, y: height - 45, size: 10, font: fontBold, color: rgb(1, 1, 1),
  })

  let y = height - 95

  // Customer info
  page.drawRectangle({ x: 50, y: y - 55, width: 260, height: 65, color: rgb(0.97, 0.97, 0.97) })
  y -= 10
  page.drawText('TO:', { x: 50, y, size: 7, font, color: rgb(...GREY) })
  y -= 14
  page.drawText(
    customer.business_name || customer.contact_name || 'Customer',
    { x: 50, y, size: 11, font: fontBold, color: rgb(...DARK) }
  )
  if (customer.address) {
    y -= 13
    page.drawText(customer.address, { x: 50, y, size: 8, font, color: rgb(...GREY) })
  }
  if (customer.email) {
    y -= 12
    page.drawText(customer.email, { x: 50, y, size: 8, font, color: rgb(...GREY) })
  }

  // Total outstanding box
  const boxX = RIGHT_MARGIN - 150
  page.drawRectangle({ x: boxX, y: height - 160, width: 150, height: 65, color: rgb(0.99, 0.94, 0.94) })
  page.drawText('TOTAL OUTSTANDING', { x: boxX + 8, y: height - 110, size: 7, font, color: rgb(...GREY) })
  page.drawText(fmt(totalOutstanding), { x: boxX + 8, y: height - 128, size: 16, font: fontBold, color: rgb(...RED) })
  page.drawText(`${invoices.length} open invoice${invoices.length !== 1 ? 's' : ''}`, {
    x: boxX + 8, y: height - 146, size: 8, font, color: rgb(...GREY),
  })

  y -= 25

  // Divider
  page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 1, color: rgb(0.75, 0.75, 0.75) })
  y -= 20

  // Table header
  page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 18, color: rgb(0.1, 0.1, 0.1) })
  const headers = [
    { label: 'INV DATE', x: 52 },
    { label: 'DUE DATE', x: 130 },
    { label: 'REFERENCE', x: 208 },
    { label: 'INVOICE AMT', x: 320 },
    { label: 'PAID', x: 400 },
    { label: 'OUTSTANDING', x: 465 },
  ]
  for (const h of headers) {
    page.drawText(h.label, { x: h.x, y: y + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
  }
  y -= 20

  let rowIdx = 0
  for (const inv of invoices) {
    if (rowIdx % 2 === 0) {
      page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 18, color: rgb(0.97, 0.97, 0.97) })
    }

    const overdue   = isOverdue(inv.due_date)
    const dateColor = overdue ? RED : DARK

    page.drawText(fmtDate(inv.date),     { x: 52,  y, size: 8, font, color: rgb(...DARK) })
    page.drawText(fmtDate(inv.due_date), { x: 130, y, size: 8, font, color: rgb(...dateColor) })
    page.drawText(inv.reference,         { x: 208, y, size: 8, font, color: rgb(...DARK) })
    page.drawText(fmt(inv.amount),       { x: 320, y, size: 8, font, color: rgb(...DARK) })
    page.drawText(
      inv.amount_paid > 0 ? fmt(inv.amount_paid) : '—',
      { x: 400, y, size: 8, font, color: rgb(...GREEN) }
    )
    page.drawText(fmt(inv.outstanding), { x: 465, y, size: 8, font: fontBold, color: rgb(...RED) })

    // Overdue label
    if (overdue) {
      page.drawText('OVERDUE', { x: RIGHT_MARGIN - 45, y, size: 6, font: fontBold, color: rgb(...RED) })
    }
    // Partial label
    if (inv.status === 'partial') {
      page.drawText('PART PAID', { x: RIGHT_MARGIN - 48, y: y - 8, size: 6, font, color: rgb(...AMBER) })
    }

    y -= 20
    rowIdx++
  }

  // Total row
  y -= 5
  page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 1, color: rgb(0.4, 0.4, 0.4) })
  y -= 18

  page.drawRectangle({ x: 380, y: y - 6, width: RIGHT_MARGIN - 380, height: 24, color: rgb(0.99, 0.94, 0.94) })
  page.drawText('TOTAL OUTSTANDING:', { x: 290, y: y + 3, size: 10, font: fontBold, color: rgb(...DARK) })
  page.drawText(fmt(totalOutstanding), { x: 465,  y: y + 3, size: 11, font: fontBold, color: rgb(...RED) })

  // Footer
  y -= 35
  page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) })
  y -= 15
  page.drawText(
    `Payment Terms: ${customer.payment_terms || '30 days'}`,
    { x: 50, y, size: 8, font, color: rgb(...GREY) }
  )
  page.drawText(
    "stods bakeryBakery  |  noreply@debsbakery.store",
    { x: RIGHT_MARGIN - 250, y, size: 8, font, color: rgb(...GREY) }
  )

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}