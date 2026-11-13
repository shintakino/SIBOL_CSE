import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // Only the canonical tunnel hostname uses forwarded protocol for redirects.
  // Private Docker health checks do not carry that hostname or header.
  if (
    request.headers.get("host") === "sibol.shintakino.qzz.io" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      "https://sibol.shintakino.qzz.io",
    );
    return NextResponse.redirect(target, 308);
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (request.headers.get("host") === "sibol.shintakino.qzz.io")
    response.headers.set("Strict-Transport-Security", "max-age=15552000");
  return response;
}
