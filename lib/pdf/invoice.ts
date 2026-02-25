import PDFDocument from 'pdfkit'

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
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

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
         .text('TAX INVOICE', 50, 80)

      // Invoice Details
      doc.fontSize(10)
         .text(`Invoice #: ${order.order_number || order.id.slice(0, 8)}`, 350, 50)
         .text(`Date: ${formatDate(order.delivery_date)}`, 350, 65)

      // Customer Details
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Bill To:', 50, 120)
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(order.customer.business_name || order.customer.contact_name || order.customer.email || 'Customer', 50, 140)
      
      if (order.customer.address) {
        doc.text(order.customer.address, 50, 155)
      }
      if (order.customer.email) {
        doc.text(order.customer.email, 50, order.customer.address ? 170 : 155)
      }

      // Line separator
      doc.moveTo(50, 200).lineTo(550, 200).stroke()

      // Table Header
      let yPos = 220
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Item', 50, yPos)
         .text('Code', 280, yPos)
         .text('Qty', 380, yPos)
         .text('Price', 440, yPos)
         .text('Total', 500, yPos, { align: 'right', width: 50 })

      doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke()

      yPos += 25

      // Order Items
      doc.font('Helvetica')
      let subtotal = 0

      for (const item of order.order_items) {
        if (yPos > 700) {
          doc.addPage()
          yPos = 50
        }

        const lineTotal = item.quantity * item.price
        subtotal += lineTotal

        doc.fontSize(9)
           .text(item.product.name, 50, yPos, { width: 220 })
           .text(item.product.product_code || '-', 280, yPos)
           .text(item.quantity.toString(), 380, yPos)
           .text(formatCurrency(item.price), 440, yPos)
           .text(formatCurrency(lineTotal), 500, yPos, { align: 'right', width: 50 })

        yPos += 20
      }

      // Totals
      yPos += 10
      doc.moveTo(350, yPos).lineTo(550, yPos).stroke()
      yPos += 15

      const gstRate = 0.1 // 10% GST
      const gstAmount = subtotal * gstRate
      const total = subtotal + gstAmount

      doc.fontSize(10)
         .font('Helvetica')
         .text('Subtotal:', 400, yPos)
         .text(formatCurrency(subtotal), 500, yPos, { align: 'right', width: 50 })

      yPos += 20
      doc.text('GST (10%):', 400, yPos)
         .text(formatCurrency(gstAmount), 500, yPos, { align: 'right', width: 50 })

      yPos += 5
      doc.moveTo(350, yPos).lineTo(550, yPos).stroke()
      yPos += 15

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Total:', 400, yPos)
         .text(formatCurrency(total), 500, yPos, { align: 'right', width: 50 })

      // Footer
      yPos += 50
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666')
         .text('Payment Terms: Due on receipt', 50, yPos)
         .text('Thank you for your business!', 50, yPos + 15)

      // ABN/Business details (if applicable)
      doc.fontSize(8)
         .text("Deb's Bakery | ABN: [Your ABN]", 50, 750, { align: 'center' })

      doc.end()

    } catch (error) {
      reject(error)
    }
  })
}