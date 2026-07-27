import type { NextRequest } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { ok } from "@/lib/utils/route";

type SessionKeyInfo = {
  id: string;
  expiresAt?: string | Date | null;
};

function isHttpsRequest(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProto === "https" || request.nextUrl.protocol === "https:";
}

export async function issueAccessSession<T extends SessionKeyInfo>(request: NextRequest, accessKey: string, data: T) {
  // Older builds stored the raw activation key in Project.accessKeyId. Migrate it
  // once at login so subsequent authorization and file serving use the stable ID.
  await prisma.project.updateMany({
    where: { accessKeyId: accessKey },
    data: { accessKeyId: data.id },
  });

  const sessionToken = await createSessionToken(data.id, env.APP_SECRET, data.expiresAt);
  const response = ok({ ...data, sessionToken });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  return response;
}
