import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthLayout>
      <div className="page-heading">
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password.</h1>
        <p>You’ll use this the next time you sign in.</p>
      </div>
      <AuthForm mode="reset-password" token={token} invalidToken={!!error} />
    </AuthLayout>
  );
}
