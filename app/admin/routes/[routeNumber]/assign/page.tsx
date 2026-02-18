export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import CustomerAssignmentView from "./customer-assignment-view";

async function getRouteData(routeNumber: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/routes/${routeNumber}`,
    { cache: 'no-store' }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data.route;
}

export default async function AssignCustomersPage({
  params,
}: {
  params: Promise<{ routeNumber: string }>;
}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { routeNumber } = await params;
  const route = await getRouteData(routeNumber);

  if (!route) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold text-lg">Route not found</p>
          <a
            href="/admin/routes"
            className="inline-block mt-4 text-red-600 hover:underline"
          >
            ← Back to routes
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <a
        href={`/admin/routes/${routeNumber}`}
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Route
      </a>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Assign Customers to {route.route_number}
        </h1>
        <p className="text-gray-600">{route.route_name}</p>
        {route.driver_name && (
          <p className="text-sm text-gray-500">Driver: {route.driver_name}</p>
        )}
      </div>

      <CustomerAssignmentView 
        routeNumber={routeNumber} 
        initialCustomers={route.customers || []} 
      />
    </div>
  );
}