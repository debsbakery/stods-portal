import PDFDocument from 'pdfkit'

interface PackingSlipData {
  id: string
  delivery_date: string
  customer: {
    business_name?: string
    contact_name?: string
  }
  order_items: Array<{
    quantity: number
    product: {
      name: string
      product_code?: string
    }
  }>
}

export async function generateBatchPackingSlips(orders: PackingSlipData[]): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-AU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      }

      for (let i = 0; i < orders.length; i++) {
        if (i > 0) doc.addPage()

        const order = orders[i]

        // Header with bakery info
        doc.fontSize(24)
           .fillColor('#006A4E')
           .text("Deb's Bakery", 50, 50)
        
        doc.fontSize(10)
           .fillColor('#333')
           .text('(04) 1234-5678', 50, 80)

        doc.fontSize(20)
           .fillColor('#CE1126')
           .text('PACKING SLIP', { align: 'center' })
        
        doc.moveDown()

        // Customer Details
        doc.fontSize(12)
           .fillColor('#333')
           .text(`Customer: ${order.customer.business_name || order.customer.contact_name}`, 50, 140)
           .text(`Delivery Date: ${formatDate(order.delivery_date)}`, 50, 158)
           .text(`Order #: ${order.id.slice(0, 8)}`, 50, 176)
        
        doc.moveDown(2)

        // Table Header
        const tableTop = doc.y
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Item', 50, tableTop)
           .text('Qty', 400, tableTop)
           .text('Code', 480, tableTop)
        
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke()
        doc.moveDown()

        // Items
        doc.font('Helvetica')
        order.order_items.forEach((item) => {
          const y = doc.y
          doc.text(item.product.name, 50, y, { width: 330 })
          doc.text(item.quantity.toString(), 400, y)
          doc.text(item.product.product_code || '', 480, y)
          doc.moveDown(0.5)
        })

        // Footer
        doc.moveDown(2)
        doc.fontSize(10)
           .fillColor('#666')
           .text('Thank you for your order!', { align: 'center' })
      }

      doc.end()

    } catch (error) {
      reject(error)
    }
  })
}