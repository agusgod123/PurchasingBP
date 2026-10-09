"use server";

import { db } from "@/server/db";
import { getActor } from "@/server/auth/current";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { detailVisibilityWhere } from "@/server/modules/requests/access";
import { runAction } from "@/server/action";
import { REQUEST_STATUS, PO_STATUS } from "@/lib/status";

export async function markNotificationRead(id: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await db.notification.updateMany({ where: { id, recipientId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
    return null;
  });
}

export async function markAllNotificationsRead() {
  return runAction(async () => {
    const ctx = await getActor();
    await db.notification.updateMany({ where: { recipientId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
    return null;
  }, "Semua notifikasi ditandai sudah dibaca.");
}

export interface SearchHit {
  type: "request" | "po";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(q: string): Promise<SearchHit[]> {
  const ctx = await getActor();
  const term = q.trim();
  if (term.length < 2) return [];
  const contains = { contains: term, mode: "insensitive" as const };
  const requests = await db.request.findMany({
    where: {
      AND: [
        detailVisibilityWhere(ctx.user),
        { OR: [{ requestNumber: contains }, { title: contains }, { items: { some: { itemName: contains } } }] },
      ],
    },
    select: { id: true, requestNumber: true, title: true, status: true, department: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  const hits: SearchHit[] = requests.map((r) => ({
    type: "request",
    id: r.id,
    title: `${r.requestNumber ?? "Draf"} · ${r.title}`,
    subtitle: `${REQUEST_STATUS[r.status].label} · ${r.department.name}`,
    href: `/pengajuan/${r.id}`,
  }));
  if (can(ctx.user, PERMISSIONS.PURCHASING_MANAGE)) {
    const pos = await db.purchaseOrder.findMany({
      where: { OR: [{ poNumber: contains }, { title: contains }, { vendor: { name: contains } }, { vendorReference: contains }] },
      select: { id: true, poNumber: true, title: true, status: true, vendor: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });
    hits.push(
      ...pos.map((p) => ({
        type: "po" as const,
        id: p.id,
        title: `${p.poNumber}${p.title ? ` · ${p.title}` : ""}`,
        subtitle: `${PO_STATUS[p.status].label}${p.vendor ? ` · ${p.vendor.name}` : ""}`,
        href: `/purchasing/po/${p.id}`,
      })),
    );
  }
  return hits;
}
