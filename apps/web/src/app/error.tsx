"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { AuthLayout } from "@/components/auth-layout";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AuthLayout>
      <div role="alert" className="page-heading">
        <h1>A small interruption.</h1>
        <p>We couldn’t load this page. Check your connection and try again.</p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </AuthLayout>
  );
}
