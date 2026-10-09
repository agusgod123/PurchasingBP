import { CheckCircle2, PackageCheck } from "lucide-react";

const features = [
  "Ajukan barang dalam beberapa menit, draf tersimpan otomatis",
  "Pantau posisi pengajuan tanpa bertanya lewat chat",
  "Persetujuan, pembelian, dan serah terima tercatat lengkap",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const appName = process.env.APP_NAME || "e-Pengadaan";
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
            <PackageCheck className="size-5" />
          </span>
          {appName}
        </div>
        <div className="mt-auto max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">Pengajuan barang dan purchasing dalam satu tempat.</h1>
          <ul className="space-y-3 text-[15px] text-primary-foreground/85">
            {features.map((f) => (
              <li key={f} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 font-semibold lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PackageCheck className="size-4" />
            </span>
            {appName}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
