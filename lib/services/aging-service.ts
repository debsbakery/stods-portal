import { prisma } from '@/lib/prisma'
import { differenceInDays } from 'date-fns'
import { Prisma } from '@prisma/client'

export class AgingService {
  
  async calculateAging(customerId: string) {
    const buckets = {
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      daysOver90: 0
    }

    const openInvoices = await prisma.arTransaction.findMany({
      where: {
        customerId,
        type: 'invoice',
        paidDate: null
      }
    })

    const today = new Date()

    for (const invoice of openInvoices) {
      if (!invoice.dueDate) continue

      const daysOverdue = differenceInDays(today, new Date(invoice.dueDate))
      const amount = Number(invoice.amount)

      if (daysOverdue <= 0) {
        buckets.current += amount
      } else if (daysOverdue <= 30) {
        buckets.days1To30 += amount
      } else if (daysOverdue <= 60) {
        buckets.days31To60 += amount
      } else if (daysOverdue <= 90) {
        buckets.days61To90 += amount
      } else {
        buckets.daysOver90 += amount
      }
    }

    const totalDue = Object.values(buckets).reduce((sum, val) => sum + val, 0)

    // Upsert aging record
    await prisma.arAging.upsert({
      where: { customerId },
      create: {
        customerId,
        ...buckets,
        totalDue: new Prisma.Decimal(totalDue)
      },
      update: {
        ...buckets,
        totalDue: new Prisma.Decimal(totalDue)
      }
    })

    return buckets
  }

  async updateAllAging() {
    const customers = await prisma.customer.findMany({
      where: { balance: { gt: 0 } }
    })

    for (const customer of customers) {
      await this.calculateAging(customer.id)
    }

    console.log(`📊 Updated aging for ${customers.length} customers`)
    return customers.length
  }

  async getAgingReport() {
    return await prisma.customer.findMany({
      where: { balance: { gt: 0 } },
      include: { aging: true },
      orderBy: {
        aging: { totalDue: 'desc' }
      }
    })
  }
}