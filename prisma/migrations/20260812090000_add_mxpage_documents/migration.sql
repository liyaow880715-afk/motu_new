CREATE TABLE "PageDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "authority" TEXT NOT NULL DEFAULT 'LEGACY',
  "publishedRevisionId" TEXT,
  "nextPublishNumber" INTEGER NOT NULL DEFAULT 1,
  "legacySourceHash" TEXT,
  "legacySyncedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PageDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageDocument_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "PageRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PageRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "pageData" JSONB NOT NULL,
  "rootNodeStableId" TEXT NOT NULL,
  "editSequence" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT NOT NULL,
  "parentRevisionId" TEXT,
  "summary" TEXT,
  "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PageRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PageDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageRevision_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "PageRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PageNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revisionId" TEXT NOT NULL,
  "stableId" TEXT NOT NULL,
  "parentStableId" TEXT,
  "nodeType" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "data" JSONB NOT NULL,
  "sourceType" TEXT,
  "sourceKey" TEXT,
  "sourceRecordId" TEXT,
  "legacySectionId" TEXT,
  "nodeHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PageNode_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PageRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageNode_legacySectionId_fkey" FOREIGN KEY ("legacySectionId") REFERENCES "PageSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PageDocument_projectId_key" ON "PageDocument"("projectId");
CREATE INDEX "PageDocument_publishedRevisionId_idx" ON "PageDocument"("publishedRevisionId");
CREATE INDEX "PageDocument_authority_updatedAt_idx" ON "PageDocument"("authority", "updatedAt");
CREATE UNIQUE INDEX "PageRevision_documentId_number_key" ON "PageRevision"("documentId", "number");
CREATE INDEX "PageRevision_documentId_kind_createdAt_idx" ON "PageRevision"("documentId", "kind", "createdAt");
CREATE INDEX "PageRevision_parentRevisionId_idx" ON "PageRevision"("parentRevisionId");
CREATE INDEX "PageRevision_contentHash_idx" ON "PageRevision"("contentHash");
CREATE UNIQUE INDEX "PageNode_revisionId_stableId_key" ON "PageNode"("revisionId", "stableId");
CREATE UNIQUE INDEX "PageNode_revisionId_sourceType_sourceKey_key" ON "PageNode"("revisionId", "sourceType", "sourceKey");
CREATE INDEX "PageNode_revisionId_parentStableId_sortOrder_idx" ON "PageNode"("revisionId", "parentStableId", "sortOrder");
CREATE INDEX "PageNode_sourceType_sourceKey_idx" ON "PageNode"("sourceType", "sourceKey");
CREATE INDEX "PageNode_legacySectionId_idx" ON "PageNode"("legacySectionId");
CREATE INDEX "PageNode_nodeHash_idx" ON "PageNode"("nodeHash");
CREATE INDEX "PageNode_revisionId_status_idx" ON "PageNode"("revisionId", "status");
