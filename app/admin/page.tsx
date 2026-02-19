import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminClientView from './admin-client-view';

export default async function AdminPage() {
  const supabase = await createClient();

  // 🔐 Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  // ❌ Not logged in
  if (error || !user) {
    redirect('/login');
  }

  // 🔍 Check role
  const userRole = user.user_metadata?.role;

  console.log('🔍 Admin Page - User:', user.email);
  console.log('🔍 Admin Page - Role:', userRole);

  // ❌ Not admin - redirect to customer portal
  if (userRole !== 'admin') {
    console.log('❌ Not admin, redirecting to /portal');
    redirect('/portal');
  }

  // ✅ Admin authenticated
  console.log('✅ Admin access granted');
  return <AdminClientView />;
}