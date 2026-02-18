export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import ProductForm from "../components/product-form";

export default async function CreateProductPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href="/admin/products"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Products
      </a>

      <h1 className="text-3xl font-bold mb-8">Add New Product</h1>

      <div className="max-w-2xl">
        <ProductForm />
      </div>
    </div>
  );
}