"use client";

import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={cn("w-full", className)} {...props}>
      {pending && <Spinner />}
      {pending ? (pendingText ?? "Memproses…") : children}
    </Button>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <Alert variant={error ? "destructive" : "default"} className={cn(success && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200")}>
      {error ? <AlertCircle /> : <CheckCircle2 />}
      <AlertDescription className={cn(success && "text-emerald-800 dark:text-emerald-200")}>{error ?? success}</AlertDescription>
    </Alert>
  );
}

export function FieldHint({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p className="text-[13px] text-destructive">{error}</p>;
  if (hint) return <p className="text-[13px] text-muted-foreground">{hint}</p>;
  return null;
}
