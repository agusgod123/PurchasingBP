import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { getRequestFormData } from "@/server/queries/requests";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { RequestForm } from "../request-form";
import { blankItem } from "../form-shared";
import { dateKeyInTz, addDays } from "@/server/time";

export const metadata: Metadata = { title: "Buat Pengajuan" };

export default async function NewRequestPage() {
  const user = await requirePermission(PERMISSIONS.REQUEST_CREATE);
  if (!user.departmentId) {
    return (
      <>
        <PageHeader title="Buat Pengajuan" />
        <EmptyState
          title="Akun belum terhubung ke data pegawai"
          description="Admin perlu menghubungkan akun Anda ke data pegawai dan bagian sebelum Anda dapat membuat pengajuan."
        />
      </>
    );
  }
  const form = await getRequestFormData(user);
  const defaultNeeded = dateKeyInTz(addDays(new Date(), 14));
  return (
    <>
      <PageHeader
        title="Buat Pengajuan"
        description="Isi kebutuhan barang Anda. Isian tersimpan otomatis — Anda bisa melanjutkan kapan saja dari menu Pengajuan Saya."
        back={{ href: "/pengajuan", label: "Pengajuan Saya" }}
      />
      <RequestForm
        initial={{ title: "", generalReason: "", requestedPriority: "NORMAL", neededDate: defaultNeeded, items: [blankItem("new-1")] }}
        categories={form.categories}
        catalog={form.catalog}
        documents={[]}
        attachmentRequired={form.attachmentRequired}
        budgetRemaining={form.budgetRemaining}
        departmentName={user.departmentName}
      />
    </>
  );
}
