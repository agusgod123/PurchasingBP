"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

interface Options<T> {
  /** Pesan sukses default (dapat ditimpa oleh pesan dari server). */
  success?: string | ((data: T) => string | null) | null;
  onSuccess?: (data: T) => void;
  /** Muat ulang data server setelah sukses (default true). */
  refresh?: boolean;
}

/**
 * Menjalankan Server Action dengan status loading, toast, dan penanganan
 * gangguan jaringan (isian di formulir tidak hilang karena state tetap di client).
 */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<Result<T>>, options: Options<T> = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    (...args: A) =>
      new Promise<Result<T>>((resolve) => {
        startTransition(async () => {
          let result: Result<T>;
          try {
            result = await action(...args);
          } catch {
            result = {
              ok: false,
              error: "Koneksi ke server gagal. Isian Anda tidak hilang — periksa jaringan lalu coba lagi.",
            };
          }
          if (result.ok) {
            setFieldErrors({});
            const msg =
              result.message ??
              (typeof options.success === "function" ? options.success(result.data) : options.success);
            if (msg) toast.success(msg);
            options.onSuccess?.(result.data);
            if (options.refresh !== false) router.refresh();
          } else {
            setFieldErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
          resolve(result);
        });
      }),
    [action, options, router],
  );

  return { run, pending, fieldErrors, setFieldErrors };
}
