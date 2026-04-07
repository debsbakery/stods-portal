export const dynamic = 'force-dynamic'

import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PriceCompareView from './price-compare-view'

export default async function PriceComparePage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  return <PriceCompareView />
}