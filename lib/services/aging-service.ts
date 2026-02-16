import { createClient } from '@/lib/supabase/server';

export class AgingService {
  static async calculateAging(customerId: string) {
    const supabase = await createClient();
    
    const { data } = await supabase
      .from('ar_aging')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    return data;
  }

  static async updateAllAging() {
    const supabase = await createClient();
    
    const { data: customers } = await supabase
      .from('customers')
      .select('id');

    if (!customers) {
      return { success: false };
    }

    for (const customer of customers) {
      await this.calculateAging(customer.id);
    }

    return { success: true, count: customers.length };
  }

  static async getCustomerAging(customerId: string) {
    return this.calculateAging(customerId);
  }
}
