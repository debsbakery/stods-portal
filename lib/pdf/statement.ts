import PDFDocument from 'pdfkit'

interface StatementData {
  customer: any
  orders: any[]
  payments: any[]
  openingBalance: number
  startDate: string | null
  endDate: string
}

export async function generateStatementPDF(data: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const { customer, orders, payments, openingBalance, startDate, endDate } = data

      // Helper functions
      const formatCurrency = (amount: number | string) => {
        return `$${parseFloat(amount.toString()).toFixed(2)}`
      }

      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
      }

      // Header
      doc.fontSize(24)
         .fillColor('#006A4E')
         .text("Deb's Bakery", 50, 50)
      
      doc.fontSize(10)
         .fillColor('#333')
         .text('Account Statement', 50, 80)

      // Customer Info
      doc.fontSize(12)
         .text(`To: ${customer.business_name || customer.contact_name || customer.email}`, 50, 120)
      
      if (customer.address) {
        doc.fontSize(10).text(customer.address, 50, 138)
      }
      if (customer.email) {
        doc.fontSize(10).text(customer.email, 50, 153)
      }

      // Statement Period
      doc.fontSize(10)
         .text(`Statement Period:`, 350, 120)
         .text(`${startDate ? formatDate(startDate) : 'Beginning'} - ${formatDate(endDate)}`, 350, 135)
         .text(`Date Printed: ${formatDate(new Date().toISOString())}`, 350, 150)

      doc.moveTo(50, 175).lineTo(550, 175).stroke()

      // Opening Balance
      let yPos = 195
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text('Opening Balance:', 50, yPos)
         .text(formatCurrency(openingBalance), 450, yPos, { align: 'right', width: 100 })

      yPos += 30

      // Table Header
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Date', 50, yPos)
         .text('Description', 120, yPos)
         .text('Charges', 380, yPos, { align: 'right', width: 80 })
         .text('Payments', 470, yPos, { align: 'right', width: 80 })

      doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke()

      yPos += 25

      // Combine transactions
      const transactions = [
        ...orders.map(order => ({
          date: order.delivery_date,
          type: 'invoice',
          description: `Invoice #${order.order_number || order.id.slice(0, 8)}`,
          amount: parseFloat(order.total_amount || '0'),
        })),
        ...payments.map(payment => ({
          date: payment.payment_date,
          type: 'payment',
          description: `Payment - ${payment.payment_method}${payment.reference_number ? ` (${payment.reference_number})` : ''}`,
          amount: parseFloat(payment.amount || '0'),
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      let runningBalance = openingBalance

      // Transactions
      doc.font('Helvetica')

      for (const transaction of transactions) {
        if (yPos > 700) {
          doc.addPage()
          yPos = 50
        }

        doc.fontSize(9)
           .text(formatDate(transaction.date), 50, yPos)
           .text(transaction.description, 120, yPos, { width: 240 })

        if (transaction.type === 'invoice') {
          doc.text(formatCurrency(transaction.amount), 380, yPos, { align: 'right', width: 80 })
          runningBalance += transaction.amount
        } else {
          doc.text(formatCurrency(transaction.amount), 470, yPos, { align: 'right', width: 80 })
          runningBalance -= transaction.amount
        }

        yPos += 18
      }

      // Totals
      yPos += 10
      doc.moveTo(50, yPos).lineTo(550, yPos).stroke()
      yPos += 15

      const totalCharges = orders.reduce((sum, order) => sum + parseFloat(order.total_amount || '0'), 0)
      const totalPayments = payments.reduce((sum, payment) => sum + parseFloat(payment.amount || '0'), 0)

      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Total Charges:', 250, yPos)
         .text(formatCurrency(totalCharges), 380, yPos, { align: 'right', width: 80 })

      yPos += 18
      doc.text('Total Payments:', 250, yPos)
         .text(formatCurrency(totalPayments), 470, yPos, { align: 'right', width: 80 })

      yPos += 20
      doc.moveTo(50, yPos).lineTo(550, yPos).stroke()
      yPos += 15

      doc.fontSize(12)
         .fillColor('#CE1126')
         .text('Closing Balance:', 250, yPos)
         .text(formatCurrency(runningBalance), 380, yPos, { align: 'right', width: 170 })

      // Terms
      yPos += 35
      doc.fontSize(9)
         .fillColor('#666')
         .text(`Payment Terms: ${customer.payment_terms || 'Due on receipt'}`, 50, yPos)

      if (runningBalance > 0) {
        yPos += 20
        doc.fillColor('#CE1126')
           .text('⚠ This account is overdue. Please arrange payment at your earliest convenience.', 50, yPos, {
             width: 500,
           })
      }

      doc.end()

    } catch (error) {
      reject(error)
    }
  })
}