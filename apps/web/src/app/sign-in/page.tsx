import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default function Page() {
  return (
    <AuthLayout>
      <div className="page-heading">
        <p className="eyebrow">A little progress, every day</p>
        <h1>Welcome back.</h1>
        <p>Settle in. Your next step starts here.</p>
      </div>
      <AuthForm mode="sign-in" />
    </AuthLayout>
  );
}
