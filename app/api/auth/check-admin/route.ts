import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

export async function GET() {
  const isAdmin = await checkAdmin()
  return NextResponse.json({ isAdmin })
}