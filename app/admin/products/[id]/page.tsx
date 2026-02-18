export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import ProductForm from "../components/product-form";

async function getProduct(id: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/products/${id}`,
    { cache: 'no-store' }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data.product;
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold text-lg">Product not found</p>
          <a
            href="/admin/products"
            className="inline-block mt-4 text-red-600 hover:underline"
          >
            ← Back to products
          </a>
        </div>
      </div>
    );
  }

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

      <h1 className="text-3xl font-bold mb-8">
        Edit Product: {product.name}
      </h1>

      <div className="max-w-2xl">
        <ProductForm product={product} isEditing={true} />
      </div>
    </div>
  );
}