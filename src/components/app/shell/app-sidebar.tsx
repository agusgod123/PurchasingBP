"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { visibleNav } from "@/components/app/shell/nav";
import type { ClientUser } from "@/server/auth/user";

export interface ShellCounts {
  tasks: number;
  approvals: number;
  queue: number;
  unreadNotifications: number;
}

export function AppSidebar({ user, counts, appName, orgName }: { user: ClientUser; counts: ShellCounts; appName: string; orgName: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const sections = visibleNav(user.permissions);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <PackageCheck className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">{appName}</span>
                  <span className="truncate text-xs text-muted-foreground">{orgName}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section, idx) => (
          <SidebarGroup key={section.label ?? idx}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const badge = item.badgeKey ? counts[item.badgeKey] : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href, item.exact)} tooltip={item.title}>
                        <Link href={item.href} onClick={() => setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badge > 0 && (
                        <SidebarMenuBadge className="rounded-full bg-primary/10 px-1.5 text-primary">{badge > 99 ? "99+" : badge}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="px-2 pb-1 text-xs text-muted-foreground">
          Masuk sebagai <span className="font-medium text-foreground">{user.fullName}</span>
          {user.departmentName && <span className="block truncate">{user.departmentName}</span>}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
