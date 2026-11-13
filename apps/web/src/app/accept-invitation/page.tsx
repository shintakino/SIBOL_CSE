import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthLayout>
      <div className="page-heading">
        <p className="eyebrow">A space for your growth</p>
        <h1>You’re invited.</h1>
        <p>
          Create your private account using the email this invitation was sent to. Then we’ll find a
          study rhythm that fits you.
        </p>
      </div>
      <AuthForm mode="accept-invitation" token={token} />
    </AuthLayout>
  );
}
