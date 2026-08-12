CREATE TABLE "PageNodeIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "stableId" TEXT NOT NULL,
  "legacySectionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PageNodeIdentity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PageDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageNodeIdentity_legacySectionId_fkey" FOREIGN KEY ("legacySectionId") REFERENCES "PageSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PageNodeIdentity_documentId_stableId_key" ON "PageNodeIdentity"("documentId", "stableId");
CREATE INDEX "PageNodeIdentity_legacySectionId_idx" ON "PageNodeIdentity"("legacySectionId");

ALTER TABLE "PageNode" ADD COLUMN "nodeIdentityId" TEXT REFERENCES "PageNodeIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD COLUMN "pageNodeIdentityId" TEXT REFERENCES "PageNodeIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD COLUMN "pageRevisionId" TEXT REFERENCES "PageRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD COLUMN "pageNodeStableId" TEXT;

CREATE INDEX "PageNode_nodeIdentityId_idx" ON "PageNode"("nodeIdentityId");
CREATE INDEX "GenerationTask_pageNodeIdentityId_createdAt_idx" ON "GenerationTask"("pageNodeIdentityId", "createdAt");
CREATE INDEX "GenerationTask_pageRevisionId_idx" ON "GenerationTask"("pageRevisionId");

INSERT OR IGNORE INTO "PageNodeIdentity" (
  "id", "documentId", "stableId", "legacySectionId", "createdAt", "updatedAt"
)
SELECT
  lower(hex(randomblob(16))),
  "PageRevision"."documentId",
  "PageNode"."stableId",
  MAX("PageNode"."legacySectionId"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PageNode"
JOIN "PageRevision" ON "PageRevision"."id" = "PageNode"."revisionId"
GROUP BY "PageRevision"."documentId", "PageNode"."stableId";

UPDATE "PageNode"
SET "nodeIdentityId" = (
  SELECT "PageNodeIdentity"."id"
  FROM "PageNodeIdentity"
  JOIN "PageRevision" ON "PageRevision"."documentId" = "PageNodeIdentity"."documentId"
  WHERE "PageRevision"."id" = "PageNode"."revisionId"
    AND "PageNodeIdentity"."stableId" = "PageNode"."stableId"
  LIMIT 1
);

UPDATE "GenerationTask"
SET
  "pageNodeIdentityId" = (
    SELECT "PageNodeIdentity"."id"
    FROM "PageNodeIdentity"
    JOIN "PageDocument" ON "PageDocument"."id" = "PageNodeIdentity"."documentId"
    WHERE "PageDocument"."projectId" = "GenerationTask"."projectId"
      AND "PageNodeIdentity"."legacySectionId" = "GenerationTask"."sectionId"
    LIMIT 1
  ),
  "pageNodeStableId" = (
    SELECT "PageNodeIdentity"."stableId"
    FROM "PageNodeIdentity"
    JOIN "PageDocument" ON "PageDocument"."id" = "PageNodeIdentity"."documentId"
    WHERE "PageDocument"."projectId" = "GenerationTask"."projectId"
      AND "PageNodeIdentity"."legacySectionId" = "GenerationTask"."sectionId"
    LIMIT 1
  ),
  "pageRevisionId" = (
    SELECT "PageRevision"."id"
    FROM "PageRevision"
    JOIN "PageDocument" ON "PageDocument"."id" = "PageRevision"."documentId"
    WHERE "PageDocument"."projectId" = "GenerationTask"."projectId"
      AND "PageRevision"."number" = 0
    LIMIT 1
  )
WHERE "GenerationTask"."sectionId" IS NOT NULL;

-- SectionVersion used to cascade when a legacy section was replanned. Rebuild it
-- with a nullable compatibility link so node identity remains the source of truth.
CREATE TABLE "SectionVersion_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sectionId" TEXT,
  "pageNodeIdentityId" TEXT,
  "pageRevisionId" TEXT,
  "pageNodeStableId" TEXT,
  "versionNumber" INTEGER NOT NULL,
  "promptSnapshot" JSONB NOT NULL,
  "copySnapshot" JSONB NOT NULL,
  "imageAssetId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectionVersion_new_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PageSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SectionVersion_new_pageNodeIdentityId_fkey" FOREIGN KEY ("pageNodeIdentityId") REFERENCES "PageNodeIdentity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SectionVersion_new_pageRevisionId_fkey" FOREIGN KEY ("pageRevisionId") REFERENCES "PageRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SectionVersion_new_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ProductAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "SectionVersion_new" (
  "id", "sectionId", "pageNodeIdentityId", "pageRevisionId", "pageNodeStableId",
  "versionNumber", "promptSnapshot", "copySnapshot", "imageAssetId", "isActive", "createdAt"
)
SELECT
  "SectionVersion"."id",
  "SectionVersion"."sectionId",
  (
    SELECT "PageNodeIdentity"."id"
    FROM "PageNodeIdentity"
    WHERE "PageNodeIdentity"."legacySectionId" = "SectionVersion"."sectionId"
    LIMIT 1
  ),
  (
    SELECT "PageRevision"."id"
    FROM "PageRevision"
    JOIN "PageDocument" ON "PageDocument"."id" = "PageRevision"."documentId"
    JOIN "PageSection" ON "PageSection"."projectId" = "PageDocument"."projectId"
    WHERE "PageSection"."id" = "SectionVersion"."sectionId"
      AND "PageRevision"."number" = 0
    LIMIT 1
  ),
  (
    SELECT "PageNodeIdentity"."stableId"
    FROM "PageNodeIdentity"
    WHERE "PageNodeIdentity"."legacySectionId" = "SectionVersion"."sectionId"
    LIMIT 1
  ),
  "SectionVersion"."versionNumber",
  "SectionVersion"."promptSnapshot",
  "SectionVersion"."copySnapshot",
  "SectionVersion"."imageAssetId",
  "SectionVersion"."isActive",
  "SectionVersion"."createdAt"
FROM "SectionVersion";

DROP TABLE "SectionVersion";
ALTER TABLE "SectionVersion_new" RENAME TO "SectionVersion";

CREATE INDEX "SectionVersion_sectionId_createdAt_idx" ON "SectionVersion"("sectionId", "createdAt");
CREATE UNIQUE INDEX "SectionVersion_sectionId_versionNumber_key" ON "SectionVersion"("sectionId", "versionNumber");
CREATE INDEX "SectionVersion_pageNodeIdentityId_createdAt_idx" ON "SectionVersion"("pageNodeIdentityId", "createdAt");
CREATE UNIQUE INDEX "SectionVersion_pageNodeIdentityId_versionNumber_key" ON "SectionVersion"("pageNodeIdentityId", "versionNumber");
CREATE INDEX "SectionVersion_pageRevisionId_idx" ON "SectionVersion"("pageRevisionId");
