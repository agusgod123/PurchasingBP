import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/shell/app-sidebar";
import { Topbar } from "@/components/app/shell/topbar";
import { requireUser } from "@/server/auth/current";
import { toClientUser } from "@/server/auth/user";
import { shellData } from "@/server/queries/tasks";
import { getSetting } from "@/server/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [shell, orgName, cookieStore] = await Promise.all([shellData(user), getSetting("app.organization_name"), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const clientUser = toClientUser(user);
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={clientUser} counts={shell.counts} appName={process.env.APP_NAME || "e-Pengadaan"} orgName={orgName} />
      <SidebarInset className="min-w-0">
        <Topbar user={clientUser} notifications={shell.notifications} unread={shell.counts.unreadNotifications} />
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 md:px-6 md:py-7">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
