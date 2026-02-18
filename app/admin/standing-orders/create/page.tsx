export const dynamic = 'force-dynamic'
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import StandingOrderForm from "../components/standing-order-form";



async function getFormData() {
  const supabase = await createClient();

  // Fetch all customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, email, contact_name')
    .order('business_name');

  // Fetch all products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price, unit, product_number, is_available')
    .eq('is_available', true)
    .order('name');

  return {
    customers: customers || [],
    products: products || [],
  };
}

export default async function CreateStandingOrderPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { customers, products } = await getFormData();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <a
          href="/admin/standing-orders"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: "#CE1126" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Standing Orders
        </a>
        <h1 className="text-3xl font-bold">Create Standing Order</h1>
        <p className="text-gray-600">Set up a recurring weekly order for a customer</p>
      </div>

      <StandingOrderForm
        customers={customers}
        products={products}
        mode="create"
      />
    </div>
  );
}