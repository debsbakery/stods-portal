'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addSupplier(formData: {
  name: string
  contact_name: string
  phone: string
  email: string
  address: string
  notes: string
}) {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('suppliers')
      .insert([
        {
          name: formData.name,
          contact_name: formData.contact_name || null,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          notes: formData.notes || null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Server action insert error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/suppliers')
    return { success: true, data }
  } catch (error: any) {
    console.error('Server action caught error:', error)
    return { success: false, error: error.message }
  }
}

export async function getSuppliers() {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('Failed to fetch suppliers:', error)
    return { success: false, data: [], error: error.message }
  }
}