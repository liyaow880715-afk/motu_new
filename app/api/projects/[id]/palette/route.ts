import { NextRequest } from "next/server";

import {
  GET as nestedGET,
  PATCH as nestedPATCH,
  POST as nestedPOST,
} from "@/app/api/projects/[id]/plans/[planId]/palette/route";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return nestedGET(request, { params: Promise.resolve({ id, planId: "default" }) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return nestedPATCH(request, { params: Promise.resolve({ id, planId: "default" }) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return nestedPOST(request, { params: Promise.resolve({ id, planId: "default" }) });
}
