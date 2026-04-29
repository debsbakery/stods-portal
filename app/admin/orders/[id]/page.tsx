import { redirect } from 'next/navigation'

// Redirect order detail to admin dashboard (no standalone detail page exists)
export default function OrderDetailPage() {
  redirect('/admin')
}