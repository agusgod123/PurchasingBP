import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { ChangePasswordForm } from "@/components/app/change-password-form";

export const metadata: Metadata = { title: "Ganti password" };

export default async function ForceChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Ganti password</h2>
        <p className="text-sm text-muted-foreground">
          Halo {user.fullName}, demi keamanan silakan ganti password sementara Anda sebelum melanjutkan.
        </p>
      </div>
      <ChangePasswordForm redirectAfter />
    </div>
  );
}
