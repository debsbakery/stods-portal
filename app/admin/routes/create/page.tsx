export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import RouteForm from "../components/route-form";

export default async function CreateRoutePage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href="/admin/routes"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Routes
      </a>

      <h1 className="text-3xl font-bold mb-8">Create New Route</h1>

      <div className="max-w-2xl">
        <RouteForm />
      </div>
    </div>
  );
}