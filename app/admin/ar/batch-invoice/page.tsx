export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth';
import { ArrowLeft } from 'lucide-react';
import BatchInvoiceView from './batch-invoice-view';

export default async function BatchInvoicePage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect('/admin');

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Button */}
      <a
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </a>

      {/* Client Component */}
      <BatchInvoiceView />
    </div>
  );
}