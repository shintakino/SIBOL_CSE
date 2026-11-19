import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default function Page() {
  return (
    <AuthLayout>
      <h1>Welcome back</h1>
      <p>Sign in to keep your study progress synced across devices.</p>
      <AuthForm mode="sign-in" />
    </AuthLayout>
  );
}
