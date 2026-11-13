"use client";
import { Alert, AlertDescription, AlertTitle } from "@sibol-cse/ui/components/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";

export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1}>
      <Alert variant="destructive" role="alert">
        <AlertCircle />
        <AlertTitle>Let’s try that again</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}
export function Success({ children }: { children: React.ReactNode }) {
  return (
    <Alert role="status">
      <CheckCircle2 />
      <AlertTitle>All set</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
