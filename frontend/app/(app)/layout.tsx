import { redirect } from "next/navigation";
import { getCurrentDoctor } from "@/lib/session";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const doctor = await getCurrentDoctor();
  if (!doctor) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar doctor={doctor} />
      <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
    </div>
  );
}
