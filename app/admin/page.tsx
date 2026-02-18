export const dynamic = 'force-dynamic'
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import AdminClientView from "./admin-client-view";

export default async function AdminPage() {
  const isAdmin = await checkAdmin();
  
  if (!isAdmin) {
    redirect("/");
  }

  return <AdminClientView />;
}