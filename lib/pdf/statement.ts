// lib/pdf/statement.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface StatementLine {
  date: string
  description: string
  reference: string
  debit: number | null
  credit: number | null
  balance: number
  transaction_type: string
}

interface StatementData {
  customer: {
    id: string
    business_name?: string
    contact_name?: string
    email?: string
    address?: string
    balance?: number
    payment_terms?: string
  }
  lines: StatementLine[]
  openingBalance: number
  closingBalance: number
  startDate: string | null
  endDate: string
}

export async function generateStatementPDF(data: StatementData): Promise<Buffer> {
  const { customer, lines, openingBalance, closingBalance, startDate, endDate } = data

  const pdfDoc = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let page = pdfDoc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()

  // ── Helpers ──────────────────────────────────────────────────────
  const formatCurrency = (amount: number | null) =>
    amount == null ? '' : `$${amount.toFixed(2)}`

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return [
      d.getDate().toString().padStart(2, '0'),
      (d.getMonth() + 1).toString().padStart(2, '0'),
      d.getFullYear(),
    ].join('/')
  }

  const GREEN: [number, number, number] = [0, 0.416, 0.306]   // #006A4E
  const RED:   [number, number, number] = [0.808, 0.067, 0.149]
  const GREY:  [number, number, number] = [0.4, 0.4, 0.4]
  const DARK:  [number, number, number] = [0.15, 0.15, 0.15]

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: {
      size?: number
      bold?: boolean
      color?: [number, number, number]
      align?: 'left' | 'right'
      maxWidth?: number
    } = {}
  ) => {
    const f    = opts.bold ? fontBold : font
    const sz   = opts.size ?? 9
    const str  = String(text ?? '')
    const col  = opts.color ?? DARK

    let drawX = x
    if (opts.align === 'right' && opts.maxWidth) {
      const tw = f.widthOfTextAtSize(str, sz)
      drawX = x + opts.maxWidth - tw
    }

    page.drawText(str, {
      x: drawX,
      y: yPos,
      size: sz,
      font: f,
      color: rgb(...col),
    })
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.5) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end:   { x: x2, y: y2 },
      thickness,
      color: rgb(0.75, 0.75, 0.75),
    })
  }

  const drawRect = (x: number, y: number, w: number, h: number, color: [number, number, number]) => {
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgb(...color),
    })
  }

  // Column X positions
  const COL = {
    date:    50,
    desc:    125,
    debit:   360,
    credit:  430,
    balance: 490,
  }
  const RIGHT_MARGIN = width - 50

  // ── Page header function (reused for multi-page) ─────────────────
  const addPageHeader = (pageRef: typeof page, isFirst: boolean) => {
    const h = pageRef.getSize().height

    // Green header bar
    pageRef.drawRectangle({
      x: 0, y: h - 75,
      width: width, height: 75,
      color: rgb(...GREEN),
    })

    pageRef.drawText("Deb's Bakery", {
      x: 50, y: h - 35,
      size: 22, font: fontBold, color: rgb(1, 1, 1),
    })
    pageRef.drawText('ACCOUNT STATEMENT', {
      x: 50, y: h - 55,
      size: 9, font, color: rgb(0.8, 1, 0.9),
    })

    if (isFirst) {
      // Period (right aligned in header)
      const periodStr = `${startDate ? formatDate(startDate) : 'Beginning'} – ${formatDate(endDate)}`
      pageRef.drawText('Statement Period', {
        x: RIGHT_MARGIN - 180, y: h - 35,
        size: 8, font, color: rgb(0.8, 1, 0.9),
      })
      pageRef.drawText(periodStr, {
        x: RIGHT_MARGIN - 180, y: h - 50,
        size: 10, font: fontBold, color: rgb(1, 1, 1),
      })
      pageRef.drawText(`Printed: ${formatDate(new Date().toISOString())}`, {
        x: RIGHT_MARGIN - 180, y: h - 65,
        size: 8, font, color: rgb(0.8, 1, 0.9),
      })
    } else {
      pageRef.drawText('(continued)', {
        x: RIGHT_MARGIN - 80, y: h - 50,
        size: 9, font, color: rgb(0.8, 1, 0.9),
      })
    }
  }

  // ── First page ───────────────────────────────────────────────────
  addPageHeader(page, true)
  let y = height - 95

  // ── Customer info box ────────────────────────────────────────────
  drawRect(50, y - 55, 260, 65, [0.97, 0.97, 0.97])
  y -= 10
  drawText('TO:', COL.date, y, { size: 7, bold: true, color: GREY })
  y -= 14
  drawText(
    customer.business_name || customer.contact_name || customer.email || 'Customer',
    COL.date, y,
    { size: 11, bold: true }
  )
  if (customer.address) {
    y -= 13
    drawText(customer.address, COL.date, y, { size: 8, color: GREY })
  }
  if (customer.email) {
    y -= 12
    drawText(customer.email, COL.date, y, { size: 8, color: GREY })
  }
  y -= 20

  // ── Summary boxes (right side) ───────────────────────────────────
  const boxY  = height - 95
  const boxH  = 65
  const box1X = RIGHT_MARGIN - 220
  const box2X = RIGHT_MARGIN - 110

  // Opening balance box
  drawRect(box1X, boxY - boxH, 105, boxH, [0.94, 0.97, 0.94])
  page.drawText('Opening Balance', {
    x: box1X + 8, y: boxY - 20,
    size: 7, font, color: rgb(...GREY),
  })
  page.drawText(formatCurrency(openingBalance), {
    x: box1X + 8, y: boxY - 38,
    size: 13, font: fontBold, color: rgb(...DARK),
  })

  // Closing balance box
  const closeCol = closingBalance > 0 ? RED : GREEN
  drawRect(box2X, boxY - boxH, 105, boxH, [0.97, 0.94, 0.94])
  page.drawText('Closing Balance', {
    x: box2X + 8, y: boxY - 20,
    size: 7, font, color: rgb(...GREY),
  })
  page.drawText(formatCurrency(closingBalance), {
    x: box2X + 8, y: boxY - 38,
    size: 13, font: fontBold, color: rgb(...closeCol),
  })
  if (closingBalance > 0) {
    page.drawText('AMOUNT DUE', {
      x: box2X + 8, y: boxY - 54,
      size: 7, font: fontBold, color: rgb(...RED),
    })
  }

  y -= 10
  drawLine(50, y, RIGHT_MARGIN, y, 1)
  y -= 20

  // ── Table header row ─────────────────────────────────────────────
  drawRect(50, y - 4, RIGHT_MARGIN - 50, 18, [0.1, 0.1, 0.1])

  page.drawText('DATE',        { x: COL.date  + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
  page.drawText('DESCRIPTION', { x: COL.desc  + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
  page.drawText('CHARGES',     { x: COL.debit + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
  page.drawText('PAYMENTS',    { x: COL.credit+ 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
  page.drawText('BALANCE',     { x: COL.balance+2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })

  y -= 20

  // Opening balance row
  drawText(startDate ? formatDate(startDate) : '—', COL.date,    y, { size: 8, color: GREY })
  drawText('Opening Balance',                         COL.desc,    y, { size: 8, color: GREY, bold: true })
  drawText(formatCurrency(openingBalance),            COL.balance, y, { size: 8, color: GREY })
  y -= 14
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 12

  // ── Transaction rows ─────────────────────────────────────────────
  let rowIndex = 0

  for (const line of lines) {
    // New page if needed
    if (y < 80) {
      page = pdfDoc.addPage([595, 842])
      addPageHeader(page, false)
      y = page.getSize().height - 100

      // Repeat column headers
      drawRect(50, y - 4, RIGHT_MARGIN - 50, 18, [0.1, 0.1, 0.1])
      page.drawText('DATE',        { x: COL.date  + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
      page.drawText('DESCRIPTION', { x: COL.desc  + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
      page.drawText('CHARGES',     { x: COL.debit + 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
      page.drawText('PAYMENTS',    { x: COL.credit+ 2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
      page.drawText('BALANCE',     { x: COL.balance+2, y: y + 2, size: 7.5, font: fontBold, color: rgb(1,1,1) })
      y -= 20
      rowIndex = 0
    }

    // Zebra striping
    if (rowIndex % 2 === 0) {
      drawRect(50, y - 4, RIGHT_MARGIN - 50, 16, [0.97, 0.97, 0.97])
    }

    const isPayment = line.transaction_type === 'payment' || line.transaction_type === 'credit'

    drawText(formatDate(line.date), COL.date, y, { size: 8 })

    // Truncate long descriptions
    const desc = line.description.length > 38
      ? line.description.substring(0, 36) + '…'
      : line.description
    drawText(desc, COL.desc, y, { size: 8 })

    if (line.debit != null) {
      drawText(formatCurrency(line.debit),  COL.debit,   y, { size: 8 })
    }
    if (line.credit != null) {
      drawText(formatCurrency(line.credit), COL.credit,  y, { size: 8, color: GREEN })
    }

    const balColor = line.balance > 0 ? RED : (line.balance < 0 ? GREEN : DARK)
    drawText(formatCurrency(line.balance),  COL.balance, y, { size: 8, bold: true, color: balColor })

    y -= 16
    rowIndex++
  }

  // ── Totals section ───────────────────────────────────────────────
  y -= 4
  drawLine(50, y, RIGHT_MARGIN, y, 1)
  y -= 18

  const totalDebits  = lines.reduce((s, l) => s + (l.debit  ?? 0), 0)
  const totalCredits = lines.reduce((s, l) => s + (l.credit ?? 0), 0)

  drawText('TOTALS',                   COL.desc,    y, { size: 9, bold: true })
  drawText(formatCurrency(totalDebits),  COL.debit,   y, { size: 9, bold: true })
  drawText(formatCurrency(totalCredits), COL.credit,  y, { size: 9, bold: true, color: GREEN })

  y -= 8
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 20

  // Closing balance highlight
  drawRect(300, y - 8, RIGHT_MARGIN - 300, 28, closingBalance > 0 ? [0.99, 0.94, 0.94] : [0.94, 0.99, 0.94])
  drawText('CLOSING BALANCE:', 310, y + 5, { size: 11, bold: true })
  drawText(
    formatCurrency(closingBalance),
    COL.balance, y + 5,
    { size: 11, bold: true, color: closingBalance > 0 ? RED : GREEN }
  )

  // ── Footer ───────────────────────────────────────────────────────
  y -= 45
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 15

  drawText(
    `Payment Terms: ${customer.payment_terms || 'Due on receipt'}`,
    50, y,
    { size: 8, color: GREY }
  )

  drawText(
    "Deb's Bakery  |  noreply@debsbakery.store",
    RIGHT_MARGIN - 250, y,
    { size: 8, color: GREY }
  )

  if (closingBalance > 0) {
    y -= 16
    drawText(
      'Payment is overdue. Please arrange payment at your earliest convenience.',
      50, y,
      { size: 8, color: RED }
    )
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}