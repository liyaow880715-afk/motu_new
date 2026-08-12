import { notFound } from "next/navigation";

import { MxPageWorkspace } from "@/components/mxpage/mxpage-workspace";
import { bootstrapPageDocument, getPageDocument } from "@/lib/services/page-document-service";
import { getProjectDetail } from "@/lib/services/project-service";

export default async function ProjectEditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const project = await getProjectDetail(id);
  if (!project) notFound();

  const document = (await getPageDocument(id)) ?? (await bootstrapPageDocument(id));

  return <MxPageWorkspace initialProject={project} initialDocument={document as any} />;
}
