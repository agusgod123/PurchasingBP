import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { getEditableRequest, getRequestFormData } from "@/server/queries/requests";
import { listDocuments } from "@/server/modules/documents/service";
import { PageHeader, StatusBadge } from "@/components/app/ui";
import { REQUEST_STATUS } from "@/lib/status";
import { db } from "@/server/db";
import { RequestForm } from "../../request-form";

export const metadata: Metadata = { title: "Ubah Pengajuan" };

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const req = await getEditableRequest(user, id);
  if (!req) notFound();
  if (req.status !== "DRAFT" && req.status !== "REVISION_REQUIRED") redirect(`/pengajuan/${id}`);
  const [form, docs, meta] = await Promise.all([
    getRequestFormData(user, id),
    listDocuments(user, "request", id),
    db.request.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } }),
  ]);
  const isRevision = req.currentVersionNumber > 0;
  const status = REQUEST_STATUS[req.status];
  return (
    <>
      <PageHeader
        title={req.requestNumber ? `Ubah ${req.requestNumber}` : "Lanjutkan draf"}
        description={
          req.status === "REVISION_REQUIRED"
            ? "Perbaiki pengajuan sesuai catatan approver, lalu kirim ulang. Versi sebelumnya tetap tersimpan."
            : "Isian tersimpan otomatis. Kirim setelah semua lengkap."
        }
        back={{ href: req.requestNumber ? `/pengajuan/${id}` : "/pengajuan", label: req.requestNumber ? "Detail pengajuan" : "Pengajuan Saya" }}
        meta={<StatusBadge label={status.label} tone={status.tone} />}
      />
      <RequestForm
        initial={{ ...req.data, items: req.data.items.map((i) => ({ ...i, key: i.id })) }}
        requestId={id}
        lockVersion={req.lockVersion}
        serverUpdatedAt={meta.updatedAt.toISOString()}
        isRevision={isRevision}
        categories={form.categories}
        catalog={form.catalog}
        documents={docs.map((d) => ({ ...d, canDelete: d.uploadedById === user.id }))}
        attachmentRequired={form.attachmentRequired}
        budgetRemaining={form.budgetRemaining}
        departmentName={user.departmentName}
      />
    </>
  );
}
