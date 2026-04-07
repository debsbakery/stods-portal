export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StockView from './stock-view'

export default async function StockPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  return <StockView />
}