export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import RouteForm from "../components/route-form";

async function getRoute(routeNumber: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/routes/${routeNumber}`,
    { cache: 'no-store' }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data.route;
}

export default async function EditRoutePage({
  params,
}: {
  params: Promise<{ routeNumber: string }>;
}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { routeNumber } = await params;
  const route = await getRoute(routeNumber);

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
        href="/admin/routes"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Routes
      </a>

      <h1 className="text-3xl font-bold mb-8">
        Edit Route: {route.route_number}
      </h1>

      <div className="max-w-2xl space-y-6">
        {/* Route Form */}
        <RouteForm route={route} isEditing={true} />

        {/* Customer Assignment Section */}
        <div 
          className="p-6 bg-white rounded-lg shadow-md border-l-4" 
          style={{ borderColor: "#006A4E" }}
        >
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: "#006A4E" }} />
            Customer Assignments
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {route.customers?.length || 0} customer(s) assigned to this route
          </p>
          
          {/* Show assigned customers preview */}
          {route.customers && route.customers.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-2">Currently Assigned:</p>
              <div className="space-y-1">
                {route.customers.slice(0, 5).map((customer: any, idx: number) => (
                  <p key={customer.id} className="text-sm text-gray-600">
                    {idx + 1}. {customer.business_name}
                  </p>
                ))}
                {route.customers.length > 5 && (
                  <p className="text-xs text-gray-500 italic">
                    + {route.customers.length - 5} more...
                  </p>
                )}
              </div>
            </div>
          )}

          <Link
            href={`/admin/routes/${route.route_number}/assign`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#006A4E" }}
          >
            <Users className="h-4 w-4" />
            Manage Customer Assignments
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-lg shadow-md border-l-4" style={{ borderColor: "#CE1126" }}>
            <p className="text-sm text-gray-600">Total Stops</p>
            <p className="text-2xl font-bold">{route.customers?.length || 0}</p>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-md border-l-4" style={{ borderColor: "#FFD700" }}>
            <p className="text-sm text-gray-600">Est. Duration</p>
            <p className="text-2xl font-bold">
              {route.estimated_duration_minutes || 0} <span className="text-sm font-normal">min</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}