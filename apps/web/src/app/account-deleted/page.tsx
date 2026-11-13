import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;
  const code = receipt && /^[a-f0-9-]{36}$/.test(receipt) ? receipt : null;
  return (
    <AuthLayout>
      <div className="page-heading">
        <p className="eyebrow">Account closed</p>
        <h1>Your live study data has been removed.</h1>
        <p>
          Your credentials and sessions are revoked. Backups expire within 30 days. Published
          content/source attribution and pseudonymized references remain.
        </p>
      </div>
      {code && <p className="mb-6 break-all text-sm">Deletion receipt: {code}</p>}
      <Link className="inline-link" href="/sign-in">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
