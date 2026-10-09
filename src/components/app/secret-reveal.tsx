"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Menampilkan nilai rahasia sekali pakai (mis. password sementara) dengan tombol salin. */
export function SecretReveal({ value, note }: { value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <code className="flex-1 font-mono text-base tracking-wide select-all">{value}</code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
      {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
    </div>
  );
}
