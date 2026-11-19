import { Sprout } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export function Brand({ href = "/" }: { href?: Route }) {
  return (
    <Link href={href} className="brand" aria-label="Sibol home">
      <Sprout className="size-7" aria-hidden="true" />
      sibol<span className="sr-only"> CSE</span>
    </Link>
  );
}
