import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { OrderWithItems } from './types'

interface PackingSlipData {
  order: OrderWithItems
  bakeryInfo: {
    name: string
    phone: string
    address: string
  }
  productCodeRange?: {
    start: number
    end: number
  }
}

export async function generatePackingSlip(data: PackingSlipData): Promise<jsPDF> {
  const { order, bakeryInfo, productCodeRange } = data

  const doc = new jsPDF()
  const margin = 15
  const pageWidth = 210
  const debGreen: [number, number, number] = [0, 106, 78]
  const debRed: [number, number, number] = [206, 17, 38]
  const black: [number, number, number] = [0, 0, 0]
  const white: [number, number, number] = [255, 255, 255]
  const lightGray: [number, number, number] = [245, 245, 245]

  // ── Header bar ────────────────────────────────────────────────
  doc.setFillColor(...debGreen)
  doc.rect(0, 0, pageWidth, 22, 'F')

  doc.setTextColor(...white)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(bakeryInfo.name, margin, 14)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`${bakeryInfo.phone}  |  ${bakeryInfo.address}`, margin, 20)

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('PACKING SLIP', pageWidth - margin, 14, { align: 'right' })

  // ── Customer + Delivery info ───────────────────────────────────
  let yPos = 30

  // Customer block - highlighted
  doc.setFillColor(...lightGray)
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, 28, 2, 2, 'F')

  doc.setTextColor(...debGreen)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('DELIVER TO', margin + 4, yPos + 7)

  doc.setTextColor(...black)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(
    order.customer_business_name || order.customer_email || 'Customer',
    margin + 4,
    yPos + 18
  )

  // Delivery date on right
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—'

  doc.setTextColor(...debRed)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('DELIVERY DATE', pageWidth - margin - 4, yPos + 7, { align: 'right' })

  doc.setTextColor(...black)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(deliveryDate, pageWidth - margin - 4, yPos + 18, { align: 'right' })

  yPos += 36

  // Address if available
  const customerAddress = (order as any).customer_address
  if (customerAddress) {
    doc.setTextColor(80, 80, 80)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(customerAddress, margin, yPos)
    yPos += 8
  }

  // Notes if present
  if (order.notes) {
    doc.setFillColor(255, 251, 235)
    doc.setDrawColor(251, 191, 36)
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, 10, 1, 1, 'FD')
    doc.setTextColor(120, 80, 0)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('NOTE: ', margin + 3, yPos + 7)
    doc.setFont('helvetica', 'normal')
    doc.text(order.notes, margin + 15, yPos + 7)
    yPos += 14
  }

  // ── Items table ────────────────────────────────────────────────
  // Filter by product code range if specified
  let items = [...(order.order_items || [])]

  if (productCodeRange) {
    items = items.filter(item => {
      const code = parseInt((item as any).product_code?.toString() || '0')
      return code >= productCodeRange.start && code <= productCodeRange.end
    })
  }

  // Sort by product code numerically
  items.sort((a, b) => {
    const codeA = parseInt((a as any).product_code?.toString() || '9999')
    const codeB = parseInt((b as any).product_code?.toString() || '9999')
    return codeA - codeB
  })

  const tableData = items.map(item => [
    (item as any).product_code?.toString() || '—',
    item.product_name || '—',
    item.quantity.toString(),
    '',  // picked checkbox space
  ])

  autoTable(doc, {
    startY: yPos,
    head: [['Code', 'Product', 'Qty', 'Picked']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: debGreen,
      textColor: white,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: black,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [248, 252, 250],
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 105 },
      2: { cellWidth: 22, halign: 'center', fontStyle: 'bold', fontSize: 13 },
      3: { cellWidth: 22, halign: 'center', fontSize: 16 },
    },
    margin: { left: margin, right: margin },
    didDrawCell: (hookData) => {
      // Draw a proper checkbox in the picked column
      if (hookData.section === 'body' && hookData.column.index === 3) {
        const { x, y, width, height } = hookData.cell
        const boxSize = 7
        const cx = x + width / 2 - boxSize / 2
        const cy = y + height / 2 - boxSize / 2
        doc.setDrawColor(...black)
        doc.setLineWidth(0.4)
        doc.rect(cx, cy, boxSize, boxSize)
      }
    },
  })

  const tableEndY = (doc as any).lastAutoTable.finalY

  // Total items bar
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalLines = items.length

  doc.setFillColor(...black)
  doc.rect(margin, tableEndY + 3, pageWidth - margin * 2, 10, 'F')
  doc.setTextColor(...white)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${totalLines} line${totalLines !== 1 ? 's' : ''}   |   ${totalQty} total units`,
    pageWidth / 2,
    tableEndY + 10,
    { align: 'center' }
  )

  // ── Packed by signature ───────────────────────────────────────
  const sigY = tableEndY + 22
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.3)
  doc.line(margin, sigY + 10, margin + 70, sigY + 10)
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Packed by:', margin, sigY + 7)
  doc.text('Signature / Initial', margin, sigY + 16)

  // ── CUSTOMER NAME LARGE AT BOTTOM ─────────────────────────────
  // This sticks out of the bread crate — must be very visible
  const bottomY = 262

  doc.setFillColor(...debGreen)
  doc.rect(0, bottomY, pageWidth, 28, 'F')

  // Customer name very large
  const customerName = order.customer_business_name || order.customer_email || 'CUSTOMER'

  // Scale font size based on name length
  let nameFontSize = 36
  if (customerName.length > 20) nameFontSize = 28
  if (customerName.length > 30) nameFontSize = 22
  if (customerName.length > 40) nameFontSize = 18

  doc.setTextColor(...white)
  doc.setFontSize(nameFontSize)
  doc.setFont('helvetica', 'bold')
  doc.text(customerName.toUpperCase(), pageWidth / 2, bottomY + 18, { align: 'center' })

  // Delivery date small below name
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(deliveryDate, pageWidth / 2, bottomY + 26, { align: 'center' })

  return doc
}