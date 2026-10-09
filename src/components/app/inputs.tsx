"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Input Rupiah: menampilkan pemisah ribuan, menyimpan angka mentah (string digit). */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string; onValueChange: (v: string) => void }
>(function MoneyInput({ value, onValueChange, className, ...props }, ref) {
  const display = value === "" ? "" : nf.format(Number(value) || 0);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
      <Input
        ref={ref}
        inputMode="numeric"
        value={display}
        onChange={(e) => onValueChange(e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, ""))}
        className={cn("tabular pl-9 text-right", className)}
        {...props}
      />
    </div>
  );
});

/** Input kuantitas: menerima koma atau titik sebagai desimal. */
export const QtyInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string; onValueChange: (v: string) => void }
>(function QtyInput({ value, onValueChange, className, ...props }, ref) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      value={value.replace(".", ",")}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d,.]/g, "").replace(",", ".");
        const [int, ...rest] = raw.split(".");
        onValueChange(rest.length ? `${int}.${rest.join("").slice(0, 3)}` : int);
      }}
      className={cn("tabular text-right", className)}
      {...props}
    />
  );
});
