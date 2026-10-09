import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { SETTING_DESCRIPTIONS } from "@/server/settings-defaults";
import { NOTIFICATION_TYPES } from "@/server/notifications/notify";
import { PageHeader } from "@/components/app/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { SettingsForm } from "./settings-client";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Nilai awal adalah CONTOH yang aman untuk uji coba. Sesuaikan dengan kebijakan kantor; setiap perubahan tercatat di audit log."
      />
      <SettingsForm initial={settings} descriptions={SETTING_DESCRIPTIONS} notificationTypes={NOTIFICATION_TYPES} />
    </>
  );
}
