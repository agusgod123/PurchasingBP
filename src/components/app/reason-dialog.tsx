"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

/**
 * Dialog konfirmasi dengan isian alasan. Dipakai untuk tindakan yang perlu
 * dicatat (tolak, batalkan, tarik, dst).
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  label = "Alasan",
  placeholder,
  confirmText = "Konfirmasi",
  destructive = false,
  required = true,
  onConfirm,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmText?: string;
  destructive?: boolean;
  required?: boolean;
  onConfirm: (reason: string) => Promise<{ ok: boolean } | void>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (required && !reason.trim()) return;
    setBusy(true);
    try {
      const res = await onConfirm(reason.trim());
      if (!res || res.ok) {
        setOpen(false);
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-2">
          <Label htmlFor="reason">
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={submit} disabled={busy || (required && !reason.trim())}>
            {busy && <Spinner />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
