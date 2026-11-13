import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default function Page() {
  return (
    <AuthLayout>
      <div className="page-heading">
        <p className="eyebrow">Account recovery</p>
        <h1>A fresh start.</h1>
        <p>Enter your account email and we’ll send a password reset link.</p>
      </div>
      <AuthForm mode="forgot-password" />
      <p className="mt-6">
        <Link className="inline-link text-sm" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
