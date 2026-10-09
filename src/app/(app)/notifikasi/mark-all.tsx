"use client";

import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/app/use-action";
import { markAllNotificationsRead } from "../shell-actions";

export function MarkAllRead() {
  const mark = useAction(markAllNotificationsRead);
  return (
    <Button variant="outline" onClick={() => void mark.run()} disabled={mark.pending}>
      <CheckCheck className="size-4" /> Tandai semua dibaca
    </Button>
  );
}
