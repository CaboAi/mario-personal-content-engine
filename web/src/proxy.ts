import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const publicPaths = new Set([
  "/login",
  "/api/session",
  "/api/ingest",
  "/api/health",
  "/api/jobs/metrics",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.has(pathname)) return NextResponse.next();

  const authConfigured = Boolean(
    process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET,
  );
  if (!authConfigured && process.env.NODE_ENV !== "production") return NextResponse.next();

  const valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
