export const dynamic = 'force-dynamic' 
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import RunSheetView from "./run-sheet-view";

async function getRunSheetData(routeNumber: string, date: string) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/routes/${routeNumber}/run-sheet-data?date=${date}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      console.error('Run sheet API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Run sheet data error:', data.error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to fetch run sheet data:', error);
    return null;
  }
}

export default async function RunSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ routeNumber: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { routeNumber } = await params;
  const { date } = await searchParams;
  const selectedDate = date || new Date().toISOString().split('T')[0];

  const data = await getRunSheetData(routeNumber, selectedDate);

  if (!data || !data.route) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold text-lg">Unable to load run sheet</p>
          <p className="text-red-600 text-sm mt-2">
            Route <strong>{routeNumber.toUpperCase()}</strong> may not exist or has no data.
          </p>
          <div className="mt-4 flex gap-3 justify-center">
            <a 
              href="/admin/routes" 
              className="inline-block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              ← Back to routes
            </a>
            <a 
              href={`/admin/routes/${routeNumber}/assign`}
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Assign customers
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <RunSheetView data={data} />;
}