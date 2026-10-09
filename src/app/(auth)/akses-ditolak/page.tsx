import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Akses ditolak" };

export default function AccessDeniedPage() {
  return (
    <div className="space-y-5">
      <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <ShieldX className="size-5" />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Akses ditolak</h2>
        <p className="text-sm text-muted-foreground">
          Anda tidak memiliki izin untuk membuka halaman ini. Jika Anda merasa ini keliru, hubungi Admin melalui menu Bantuan.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Kembali ke Dashboard</Link>
      </Button>
    </div>
  );
}
