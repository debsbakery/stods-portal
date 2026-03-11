import { createClient } from '@/lib/supabase/server';

/**
 * Admin email whitelist
 * Add admin email addresses here
 */
const ADMIN_EMAILS = [
  'debs_bakery@outlook.com',
  'admin@allstarsbakery.com',
  'admin@norbakebroome.com',
 'Stodsbakery@outlook.com',
];

/**
 * Check if current user is an admin
 * @returns Promise<boolean>
 */
export async function checkAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.warn('⚠️ No authenticated user found');
      return false;
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() || '');
    
    if (!isAdmin) {
      console.warn(`⚠️ User ${user.email} is not an admin`);
    }

    return isAdmin;
  } catch (error) {
    console.error('❌ Error checking admin status:', error);
    return false;
  }
}

/**
 * Get current authenticated user
 * @returns Promise<User | null>
 */
export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    return null;
  }
}

/**
 * Get current customer profile
 * @returns Promise<Customer | null>
 */
export async function getCurrentCustomer() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return null;

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', user.id)
      .single();

    return customer;
  } catch (error) {
    console.error('❌ Error getting current customer:', error);
    return null;
  }
}