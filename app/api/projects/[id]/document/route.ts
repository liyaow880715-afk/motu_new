import { NextRequest } from "next/server";

import {
  bootstrapPageDocument,
  getPageDocument,
  patchPageDocumentDraft,
  publishPageDocument,
  rollbackPageDocument,
  syncLegacySectionsToDraft,
} from "@/lib/services/page-document-service";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { pageDocumentActionSchema, pageDocumentPatchSchema } from "@/lib/validations/page-document";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const document = await getPageDocument(id);
    return document ? ok(document) : fail("DOCUMENT_NOT_FOUND", "Page document has not been initialized.", null, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const input = pageDocumentActionSchema.parse(await request.json());
    if (input.action === "bootstrap") return ok(await bootstrapPageDocument(id));
    if (input.action === "sync_legacy") {
      return ok(await syncLegacySectionsToDraft(id, input.expectedEditSequence, input.force));
    }
    if (input.action === "publish") {
      return ok(await publishPageDocument(id, input.expectedEditSequence, input.expectedContentHash, input.summary));
    }
    return ok(await rollbackPageDocument(
      id,
      input.targetRevisionId,
      input.resetDraft,
      input.expectedEditSequence,
    ));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const input = pageDocumentPatchSchema.parse(await request.json());
    return ok(await patchPageDocumentDraft(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
