import { Sprout } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sibol home">
      <Sprout className="size-7" aria-hidden="true" />
      sibol<span className="sr-only"> CSE</span>
    </Link>
  );
}
