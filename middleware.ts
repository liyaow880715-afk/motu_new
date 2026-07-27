import { NextRequest, NextResponse } from "next/server";

import { isSecureAppSecret, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/version",
  "/api/auth/verify",
  "/api/auth/me",
]);

function unauthorized(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message, details: null } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function middleware(request: NextRequest) {
  if (process.env.APP_RUNTIME === "desktop" || PUBLIC_API_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.APP_SECRET;
  if (process.env.NODE_ENV === "production" && !isSecureAppSecret(secret)) {
    return unauthorized(
      "SECURITY_CONFIG_REQUIRED",
      "Web 服务尚未配置安全的 APP_SECRET，已拒绝远程 API 请求。",
      503,
    );
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const token = bearerToken ?? request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token || !secret) {
    return unauthorized("UNAUTHORIZED", "缺少有效会话，请重新登录。", 401);
  }

  const session = await verifySessionToken(token, secret);
  if (!session) {
    return unauthorized("SESSION_EXPIRED", "会话无效或已过期，请重新登录。", 401);
  }

  const headers = new Headers(request.headers);
  headers.set("x-auth-key-id", session.accessKeyId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
