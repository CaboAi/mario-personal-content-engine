import { NextResponse } from "next/server";
import {
  createSessionToken,
  MAX_AGE_SECONDS,
  secureCompare,
  SESSION_COOKIE,
} from "@/lib/session";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(address: string) {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function recordFailure(address: string) {
  const now = Date.now();
  const current = attempts.get(address);
  attempts.set(address, {
    count: (current?.resetAt ?? 0) > now ? (current?.count ?? 0) + 1 : 1,
    resetAt: (current?.resetAt ?? 0) > now ? current!.resetAt : now + WINDOW_MS,
  });
  if (attempts.size > 1_000) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }
}

export async function POST(request: Request) {
  const configured = process.env.DASHBOARD_PASSWORD;
  if (!configured) {
    return NextResponse.json({ error: "Dashboard authentication is not configured." }, { status: 503 });
  }
  const address = clientAddress(request);
  if (isRateLimited(address)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const body = (() => {
    try {
      return JSON.parse(raw) as { password?: unknown };
    } catch {
      return {};
    }
  })();
  if (typeof body.password !== "string" || !(await secureCompare(body.password, configured))) {
    recordFailure(address);
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }
  attempts.delete(address);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
