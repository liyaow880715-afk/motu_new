import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { apiSuccess } from "@/lib/utils/api";

export async function POST() {
  const response = NextResponse.json(apiSuccess({ loggedOut: true }));
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
