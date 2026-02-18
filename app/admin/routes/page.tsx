export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft, Truck, Plus } from "lucide-react";
import Link from "next/link";
import RoutesView from "./routes-view";

export default async function RoutesPage() {
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
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Truck className="h-8 w-8" style={{ color: "#006A4E" }} />
              Delivery Routes
            </h1>
            <p className="text-gray-600">
              Manage delivery routes and customer assignments
            </p>
          </div>
          <Link
            href="/admin/routes/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
            style={{ backgroundColor: "#006A4E" }}
          >
            <Plus className="h-5 w-5" />
            Create Route
          </Link>
        </div>
      </div>

      <RoutesView />
    </div>
  );
}