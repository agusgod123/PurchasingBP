import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { Money, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { DOCUMENT_STAGE, DOCUMENT_TYPE } from "@/lib/status";
import { RequirementDialog } from "./requirements-client";

export const metadata: Metadata = { title: "Dokumen Wajib" };

export default async function DocumentRequirementsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const rows = await db.documentRequirement.findMany({ orderBy: [{ stage: "asc" }, { documentType: "asc" }] });
  const stages = Object.keys(DOCUMENT_STAGE) as Array<keyof typeof DOCUMENT_STAGE>;
  return (
    <>
      <PageHeader
        title="Dokumen Wajib"
        description="Dokumen yang harus diunggah sebelum suatu tahap bisa dilanjutkan. Sistem menolak langkah berikutnya bila belum lengkap, dengan pesan yang jelas."
        actions={<RequirementDialog />}
      />
      <div className="space-y-5">
        {stages.map((stage) => {
          const list = rows.filter((r) => r.stage === stage);
          return (
            <Section key={stage} title={DOCUMENT_STAGE[stage]}>
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada dokumen wajib pada tahap ini.</p>
              ) : (
                <ul className="divide-y">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {r.minCount}× {DOCUMENT_TYPE[r.documentType]}
                          </span>
                          {r.minAmount && (
                            <span className="text-muted-foreground">
                              untuk nilai ≥ <Money value={r.minAmount} />
                            </span>
                          )}
                          {!r.isActive && <StatusBadge label="Nonaktif" />}
                        </div>
                        {r.description && <p className="text-[13px] text-muted-foreground">{r.description}</p>}
                      </div>
                      <RequirementDialog
                        requirement={{
                          id: r.id,
                          stage: r.stage,
                          documentType: r.documentType,
                          minCount: String(r.minCount),
                          minAmount: r.minAmount ? r.minAmount.toFixed(0) : "",
                          description: r.description ?? "",
                          isActive: r.isActive,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })}
      </div>
    </>
  );
}
