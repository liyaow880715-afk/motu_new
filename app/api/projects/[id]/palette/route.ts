import { NextRequest } from "next/server";

import {
  GET as nestedGET,
  PATCH as nestedPATCH,
  POST as nestedPOST,
} from "@/app/api/projects/[id]/plans/[planId]/palette/route";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return nestedGET(request, { params: { id: context.params.id, planId: "default" } });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return nestedPATCH(request, { params: { id: context.params.id, planId: "default" } });
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return nestedPOST(request, { params: { id: context.params.id, planId: "default" } });
}
