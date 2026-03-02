// lib/invoice-pdf.ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceData {
  order: {
    id: string
    delivery_date: string
    total_amount: number
    status: string
    created_at: string
    customer_business_name: string
    customer_email: string
    customer_address: string
    customer_abn: string | null
    notes: string | null
    order_items: {
      product_name: string
      quantity: number
      unit_price: number
      subtotal: number
      gst_applicable: boolean
    }[]
  }
  invoiceNumber: string
  invoiceDate: string
  bakery: {
    name: string
    phone: string
    address: string
    abn: string
    email: string
  }
}

// ── Colours (matches packing slip) ────────────────────────────────────────────

const C = {
  green:     [0, 106, 78]    as [number, number, number],
  red:       [206, 17, 38]   as [number, number, number],
  black:     [0, 0, 0]       as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  lightGray: [240, 240, 240] as [number, number, number],
  midGray:   [100, 100, 100] as [number, number, number],
  darkGray:  [50, 50, 50]    as [number, number, number],
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const { order, invoiceNumber, invoiceDate, bakery } = data

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  const PW     = 210

  // ── Dates ─────────────────────────────────────────────────────────────────

  const deliveryDateFmt = order.delivery_date
    ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '—'

  const invoiceDateFmt = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString('en-AU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : new Date().toLocaleDateString('en-AU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })

  // ── Header — green top bar + bakery name ──────────────────────────────────

  doc.setFillColor(...C.green)
  doc.rect(0, 0, PW, 2, 'F')

  doc.setTextColor(...C.green)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(bakery.name, margin, 13)

  doc.setTextColor(...C.midGray)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(bakery.phone,   PW - margin, 8,  { align: 'right' })
  doc.text(bakery.address, PW - margin, 13, { align: 'right' })
  doc.text(`ABN: ${bakery.abn}`, PW - margin, 18, { align: 'right' })

  // ── INVOICE title ─────────────────────────────────────────────────────────

  doc.setTextColor(...C.darkGray)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('TAX INVOICE', margin, 30)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.midGray)
  doc.text(`Invoice #${invoiceNumber}`, margin, 37)

  // ── Divider ───────────────────────────────────────────────────────────────

  doc.setDrawColor(...C.lightGray)
  doc.setLineWidth(0.4)
  doc.line(margin, 41, PW - margin, 41)

  // ── Bill To + Invoice Details boxes ───────────────────────────────────────

  const boxTop = 44
  const boxH   = 34

  // Bill To (left)
  doc.setFillColor(...C.lightGray)
  doc.roundedRect(margin, boxTop, 90, boxH, 1.5, 1.5, 'F')

  doc.setTextColor(...C.green)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO', margin + 4, boxTop + 7)

  const customerName = order.customer_business_name || order.customer_email || 'Customer'
  doc.setTextColor(...C.black)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(customerName, margin + 4, boxTop + 15)

  if (order.customer_address) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.midGray)
    const addrLines = doc.splitTextToSize(order.customer_address, 78)
    doc.text(addrLines, margin + 4, boxTop + 21)
  }

  if (order.customer_abn) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.midGray)
    doc.text(`ABN: ${order.customer_abn}`, margin + 4, boxTop + boxH - 4)
  }

  // Invoice Details (right)
  doc.setFillColor(...C.lightGray)
  doc.roundedRect(PW - margin - 85, boxTop, 85, boxH, 1.5, 1.5, 'F')

  const detailX     = PW - margin - 83
  const detailRight = PW - margin - 3

  const detailRow = (label: string, value: string, y: number) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.midGray)
    doc.text(label, detailX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.black)
    doc.text(value, detailRight, y, { align: 'right' })
  }

  detailRow('Invoice Number:',  `#${invoiceNumber}`,       boxTop + 9)
  detailRow('Invoice Date:',    invoiceDateFmt,             boxTop + 16)
  detailRow('Delivery Date:',   deliveryDateFmt,            boxTop + 23)
  detailRow('Payment Terms:',   '30 days',                 boxTop + 30)

  // ── Line items table ──────────────────────────────────────────────────────

  const tableStartY = boxTop + boxH + 6

  const tableRows = order.order_items.map((item) => [
    item.product_name,
    item.quantity.toString(),
    `$${item.unit_price.toFixed(2)}`,
    item.gst_applicable ? 'Yes' : 'No',
    `$${(item.subtotal ?? item.unit_price * item.quantity).toFixed(2)}`,
  ])

  autoTable(doc, {
    startY: tableStartY,
    head:   [['Product', 'Qty', 'Unit Price', 'GST', 'Subtotal']],
    body:   tableRows,
    theme:  'plain',

    headStyles: {
      textColor:   C.white,
      fillColor:   C.green,
      fontStyle:   'bold',
      fontSize:    8.5,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
    },

    bodyStyles: {
      fontSize:    8.5,
      textColor:   C.black,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      lineWidth:   { bottom: 0.15 },
      lineColor:   [220, 220, 220],
      fillColor:   C.white,
    },

    alternateRowStyles: {
      fillColor: [248, 250, 248] as [number, number, number],
    },

    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },

    margin: { left: margin, right: margin },
  })

  const tableEndY = (doc as any).lastAutoTable.finalY as number

  // ── Totals block ──────────────────────────────────────────────────────────

  const gstItems    = order.order_items.filter((i) => i.gst_applicable)
  const gstAmount   = gstItems.reduce((sum, i) => sum + (i.subtotal ?? i.unit_price * i.quantity) * 0.1, 0)
  const subExGst    = order.total_amount - gstAmount

  const totalsX = PW - margin - 80
  let   totalsY = tableEndY + 4

  const totalRow = (label: string, value: string, bold = false, color = C.black) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...C.midGray)
    doc.text(label, totalsX, totalsY)
    doc.setTextColor(...color)
    doc.text(value, PW - margin, totalsY, { align: 'right' })
    totalsY += 6
  }

  totalRow('Subtotal (ex-GST):',  `$${subExGst.toFixed(2)}`)
  totalRow('GST (10%):',          `$${gstAmount.toFixed(2)}`)

  // Divider above total
  doc.setDrawColor(...C.green)
  doc.setLineWidth(0.5)
  doc.line(totalsX, totalsY, PW - margin, totalsY)
  totalsY += 4

  // Total due
  doc.setFillColor(...C.green)
  doc.roundedRect(totalsX, totalsY - 5, PW - margin - totalsX, 10, 1, 1, 'F')
  doc.setTextColor(...C.white)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL DUE:', totalsX + 3, totalsY + 1.5)
  doc.text(`$${order.total_amount.toFixed(2)}`, PW - margin - 3, totalsY + 1.5, { align: 'right' })
  totalsY += 14

  // ── Payment details ───────────────────────────────────────────────────────

  doc.setDrawColor(...C.lightGray)
  doc.setLineWidth(0.3)
  doc.setFillColor(248, 252, 250)
  doc.roundedRect(margin, totalsY, PW - margin * 2, 22, 1.5, 1.5, 'FD')

  doc.setTextColor(...C.green)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT DETAILS', margin + 4, totalsY + 7)

  doc.setTextColor(...C.darkGray)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Please include invoice number as payment reference.', margin + 4, totalsY + 13)
  doc.text(`Payment due within 30 days of invoice date (${invoiceDateFmt}).`, margin + 4, totalsY + 19)

  // ── Notes ─────────────────────────────────────────────────────────────────

  if (order.notes) {
    totalsY += 28
    doc.setDrawColor(251, 191, 36)
    doc.setLineWidth(0.4)
    doc.setFillColor(255, 253, 245)
    const noteLines = doc.splitTextToSize(`Note: ${order.notes}`, PW - margin * 2 - 8)
    const noteH     = noteLines.length * 4.5 + 6
    doc.roundedRect(margin, totalsY, PW - margin * 2, noteH, 1, 1, 'FD')
    doc.setTextColor(140, 90, 0)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(noteLines, margin + 4, totalsY + 7)
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  doc.setFontSize(7)
  doc.setTextColor(...C.midGray)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${bakery.name}  |  ${bakery.phone}  |  ${bakery.email}  |  ABN: ${bakery.abn}`,
    PW / 2, 285, { align: 'center' }
  )
  doc.text(
    `Thank you for your business!`,
    PW / 2, 290, { align: 'center' }
  )

  return doc
}