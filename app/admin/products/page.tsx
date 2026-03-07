export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import ProductsView from "./products-view";

export default async function ProductsPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <a
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: "#CE1126" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </a>
        <a
  href="/admin/products/bulk-weights"
  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
  style={{ backgroundColor: '#0369a1' }}
>
  Bulk Weights
</a>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Product Management</h1>
            <p className="text-gray-600">
              Manage your product catalog
            </p>
          </div>
          <Link
            href="/admin/products/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
            style={{ backgroundColor: "#006A4E" }}
          >
            <Plus className="h-5 w-5" />
            Add Product
          </Link>
        </div>
      </div>

      <ProductsView />
    </div>
  );
}