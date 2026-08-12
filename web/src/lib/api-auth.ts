import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin && origin !== new URL(request.url).origin
    ? NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
    : null;
}

export async function requireDashboardSession() {
  const authConfigured = Boolean(
    process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET,
  );
  if (!authConfigured && process.env.NODE_ENV !== "production") return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return (await verifySessionToken(token))
    ? null
    : NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function requireCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
