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
  paid_status?: 'paid' | 'partial' | 'unpaid' | 'na'
  amount_paid?: number
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
  // ── Brand overrides ──────────────────────────────────────
  bakeryName?: string
  bakeryEmail?: string
  logoUrl?: string
  headerColor?: [number, number, number]
}

export async function generateStatementPDF(data: StatementData): Promise<Buffer> {
  const {
    customer, lines, openingBalance, closingBalance, startDate, endDate,
    bakeryName   = process.env.STODS_BAKERY_NAME ?? process.env.BAKERY_NAME ?? "Stods Bakery",
    bakeryEmail  = process.env.STODS_BAKERY_EMAIL ?? 'orders@stodsbakery.com',
    headerColor  = [0, 0.416, 0.306],
  } = data

  const pdfDoc   = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const formatCurrency = (amount: number | null) =>
    amount == null ? '' : '$' + amount.toFixed(2)

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return [
      d.getDate().toString().padStart(2, '0'),
      (d.getMonth() + 1).toString().padStart(2, '0'),
      d.getFullYear(),
    ].join('/')
  }

  const GREEN: [number, number, number] = [0, 0.416, 0.306]
  const RED:   [number, number, number] = [0.808, 0.067, 0.149]
  const GREY:  [number, number, number] = [0.4, 0.4, 0.4]
  const DARK:  [number, number, number] = [0.15, 0.15, 0.15]
  const AMBER: [number, number, number] = [0.8, 0.5, 0.0]
  const HEADER = headerColor

  const COL = {
    date:    50,
    desc:    115,
    status:  330,
    debit:   385,
    credit:  450,
    balance: 510,
  }
  const RIGHT_MARGIN = width - 25

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
  ) => {
    page.drawText(String(text ?? ''), {
      x,
      y:     yPos,
      size:  opts.size ?? 9,
      font:  opts.bold ? fontBold : font,
      color: rgb(...(opts.color ?? DARK)),
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
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(...color) })
  }

  const drawStatus = (status: string | undefined, x: number, y: number) => {
    if (!status || status === 'na') return
    if (status === 'paid') {
      drawRect(x, y - 3, 32, 11, [0.86, 0.97, 0.88])
      page.drawText('PAID', {
        x: x + 4, y: y + 1, size: 6.5, font: fontBold, color: rgb(...GREEN),
      })
    } else if (status === 'partial') {
      drawRect(x, y - 3, 38, 11, [0.99, 0.95, 0.82])
      page.drawText('PART PD', {
        x: x + 3, y: y + 1, size: 6.5, font: fontBold, color: rgb(...AMBER),
      })
    } else if (status === 'unpaid') {
      drawRect(x, y - 3, 36, 11, [0.99, 0.90, 0.90])
      page.drawText('UNPAID', {
        x: x + 3, y: y + 1, size: 6.5, font: fontBold, color: rgb(...RED),
      })
    }
  }

  const addPageHeader = (pageRef: typeof page, isFirst: boolean) => {
    const h = pageRef.getSize().height
    pageRef.drawRectangle({
      x: 0, y: h - 75, width, height: 75,
      color: rgb(...HEADER),
    })
    pageRef.drawText(bakeryName, {
      x: 50, y: h - 35, size: 22, font: fontBold, color: rgb(1, 1, 1),
    })
    pageRef.drawText('ACCOUNT STATEMENT', {
      x: 50, y: h - 55, size: 9, font, color: rgb(0.8, 1, 0.9),
    })

    if (isFirst) {
      const periodStr =
        (startDate ? formatDate(startDate) : 'Beginning') +
        ' - ' + formatDate(endDate)
      pageRef.drawText('Statement Period', {
        x: RIGHT_MARGIN - 180, y: h - 35, size: 8, font, color: rgb(0.8, 1, 0.9),
      })
      pageRef.drawText(periodStr, {
        x: RIGHT_MARGIN - 180, y: h - 50, size: 10, font: fontBold, color: rgb(1, 1, 1),
      })
      pageRef.drawText('Printed: ' + formatDate(new Date().toISOString()), {
        x: RIGHT_MARGIN - 180, y: h - 65, size: 8, font, color: rgb(0.8, 1, 0.9),
      })
    } else {
      pageRef.drawText('(continued)', {
        x: RIGHT_MARGIN - 80, y: h - 50, size: 9, font, color: rgb(0.8, 1, 0.9),
      })
    }
  }

  const drawTableHeader = (yRef: number) => {
    drawRect(50, yRef - 4, RIGHT_MARGIN - 50, 18, [0.1, 0.1, 0.1])
    page.drawText('DATE',        { x: COL.date    + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText('DESCRIPTION', { x: COL.desc    + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText('STATUS',      { x: COL.status  + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
   // REPLACE WITH:
page.drawText('CHARGES/CREDITS', { x: COL.debit  + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
page.drawText('PAYMENTS',        { x: COL.credit + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText('BALANCE',     { x: COL.balance + 2, y: yRef + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
  }

  // ── First page ────────────────────────────────────────────────────────────
  addPageHeader(page, true)
  let y = height - 95

  drawRect(50, y - 55, 260, 65, [0.97, 0.97, 0.97])
  y -= 10
  drawText('TO:', COL.date, y, { size: 7, bold: true, color: GREY })
  y -= 14
  drawText(
    customer.business_name || customer.contact_name || customer.email || 'Customer',
    COL.date, y, { size: 11, bold: true }
  )
  if (customer.address) { y -= 13; drawText(customer.address, COL.date, y, { size: 8, color: GREY }) }
  if (customer.email)   { y -= 12; drawText(customer.email,   COL.date, y, { size: 8, color: GREY }) }
  y -= 20

  const boxY  = height - 95
  const boxH  = 65
  const box1X = RIGHT_MARGIN - 220
  const box2X = RIGHT_MARGIN - 110

  drawRect(box1X, boxY - boxH, 105, boxH, [0.94, 0.97, 0.94])
  page.drawText('Opening Balance', { x: box1X + 8, y: boxY - 20, size: 7, font, color: rgb(...GREY) })
  page.drawText(formatCurrency(openingBalance), {
    x: box1X + 8, y: boxY - 38, size: 13, font: fontBold, color: rgb(...DARK),
  })

  const closeCol = closingBalance > 0 ? RED : GREEN
  drawRect(box2X, boxY - boxH, 105, boxH, closingBalance > 0 ? [0.97, 0.94, 0.94] : [0.94, 0.97, 0.94])
  page.drawText('Closing Balance', { x: box2X + 8, y: boxY - 20, size: 7, font, color: rgb(...GREY) })
  page.drawText(formatCurrency(closingBalance), {
    x: box2X + 8, y: boxY - 38, size: 13, font: fontBold, color: rgb(...closeCol),
  })
  if (closingBalance > 0) {
    page.drawText('AMOUNT DUE', {
      x: box2X + 8, y: boxY - 54, size: 7, font: fontBold, color: rgb(...RED),
    })
  }

  y -= 10
  drawLine(50, y, RIGHT_MARGIN, y, 1)
  y -= 20

  drawTableHeader(y)
  y -= 20

  drawText(startDate ? formatDate(startDate) : '-', COL.date,    y, { size: 8, color: GREY })
  drawText('Opening Balance',                        COL.desc,    y, { size: 8, color: GREY, bold: true })
  drawText(formatCurrency(openingBalance),           COL.balance, y, { size: 8, color: GREY })
  y -= 14
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 12

  let rowIndex = 0

  for (const line of lines) {
    if (y < 100) {
      page = pdfDoc.addPage([595, 842])
      addPageHeader(page, false)
      y = page.getSize().height - 100
      drawTableHeader(y)
      y -= 20
      rowIndex = 0
    }

    if (rowIndex % 2 === 0) {
      drawRect(50, y - 4, RIGHT_MARGIN - 50, 16, [0.97, 0.97, 0.97])
    }

    const desc = line.description.length > 30
      ? line.description.substring(0, 28) + '..'
      : line.description

    drawText(formatDate(line.date), COL.date, y, { size: 8 })
    drawText(desc,                  COL.desc, y, { size: 8 })

    if (line.transaction_type === 'invoice') {
      drawStatus(line.paid_status, COL.status, y)
    }

   // REPLACE WITH:
if (line.debit != null && line.debit !== 0) {
  const isNegDebit = line.debit < 0
  drawText(
    isNegDebit
      ? `-$${Math.abs(line.debit).toFixed(2)}`
      : formatCurrency(line.debit),
    COL.debit, y,
    { size: 8, color: isNegDebit ? GREEN : DARK }
  )
}
    if (line.credit != null && line.credit > 0) {
      drawText(formatCurrency(line.credit), COL.credit, y, { size: 8, color: GREEN })
    }

    const balColor = line.balance > 0 ? RED : (line.balance < 0 ? GREEN : DARK)
    drawText(formatCurrency(line.balance), COL.balance, y, { size: 8, bold: true, color: balColor })

    y -= 16
    rowIndex++
  }

  y -= 4
  drawLine(50, y, RIGHT_MARGIN, y, 1)
  y -= 18

 // REPLACE WITH:
const totalCharges = lines.reduce((s, l) => s + (l.debit ?? 0), 0)  // net of credits
const totalPayments = lines.reduce((s, l) => s + (l.credit ?? 0), 0)

drawText('TOTALS', COL.desc, y, { size: 9, bold: true })
drawText(
  totalCharges >= 0
    ? formatCurrency(totalCharges)
    : `-$${Math.abs(totalCharges).toFixed(2)}`,
  COL.debit, y,
  { size: 9, bold: true, color: totalCharges < 0 ? GREEN : DARK }
)
drawText(formatCurrency(totalPayments), COL.credit, y, { size: 9, bold: true, color: GREEN })

  y -= 8
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 20

  drawRect(
    300, y - 8, RIGHT_MARGIN - 300, 28,
    closingBalance > 0 ? [0.99, 0.94, 0.94] : [0.94, 0.99, 0.94]
  )
  drawText('CLOSING BALANCE:', 310, y + 5, { size: 11, bold: true })
  drawText(
    formatCurrency(closingBalance),
    COL.balance, y + 5,
    { size: 11, bold: true, color: closingBalance > 0 ? RED : GREEN }
  )

  // ── Footer ────────────────────────────────────────────────────────────────
  y -= 45
  drawLine(50, y, RIGHT_MARGIN, y)
  y -= 15

  drawText(
    'Payment Terms: ' + (customer.payment_terms || '30 days'),
    50, y,
    { size: 8, color: GREY }
  )
  drawText(
    `${bakeryName}  |  ${bakeryEmail}`,
    RIGHT_MARGIN - 250, y,
    { size: 8, color: GREY }
  )

  y -= 16
  if (closingBalance > 0) {
    drawText(
      'Amount of ' + formatCurrency(closingBalance) + ' is due for payment.',
      50, y,
      { size: 8, color: RED }
    )
  } else {
    drawText(
      'Your account is up to date. Thank you for your business.',
      50, y,
      { size: 8, color: GREEN }
    )
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}