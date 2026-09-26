import { requireAdminPage } from "@/lib/authz";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div>
      <h1 className="mb-3 text-xl font-bold sm:text-2xl">Administração</h1>
      <AdminTabs />
      {children}
    </div>
  );
}
