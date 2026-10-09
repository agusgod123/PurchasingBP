"use client";

import { useState } from "react";
import { Loader2, RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/app/use-action";
import { retryEmailAction, testEmailAction } from "../actions";

export function RetryEmailButton({ id }: { id: string }) {
  const retry = useAction(retryEmailAction);
  return (
    <Button variant="ghost" size="icon" aria-label="Kirim ulang" disabled={retry.pending} onClick={() => void retry.run(id)}>
      {retry.pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
    </Button>
  );
}

export function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const send = useAction(testEmailAction);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send.run(to);
      }}
    >
      <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Alamat tujuan" required />
      <Button type="submit" disabled={send.pending}>
        {send.pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Kirim
      </Button>
    </form>
  );
}
