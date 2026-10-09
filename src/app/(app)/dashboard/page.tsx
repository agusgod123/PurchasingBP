import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { PageHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  return <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} description="Ringkasan pekerjaan Anda hari ini." />;
}
