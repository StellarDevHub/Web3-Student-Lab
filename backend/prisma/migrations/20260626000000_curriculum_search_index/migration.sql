-- CreateTable
CREATE TABLE "curriculum_search_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "difficulty" TEXT,
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_search_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_search_entries_workspaceId_entityType_entityId_key" ON "curriculum_search_entries"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "curriculum_search_entries_workspaceId_entityType_idx" ON "curriculum_search_entries"("workspaceId", "entityType");

-- CreateIndex
CREATE INDEX "curriculum_search_entries_workspaceId_courseId_idx" ON "curriculum_search_entries"("workspaceId", "courseId");

-- Full-text search GIN index over the maintained tsvector column.
CREATE INDEX "curriculum_search_entries_search_idx" ON "curriculum_search_entries" USING GIN ("searchVector");

-- Trigger keeps "searchVector" in sync with the indexed text. The title is
-- weighted higher than the body so title matches rank above description matches.
CREATE OR REPLACE FUNCTION curriculum_search_entries_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', COALESCE(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."content", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER curriculum_search_entries_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "content"
  ON "curriculum_search_entries"
  FOR EACH ROW EXECUTE FUNCTION curriculum_search_entries_vector_update();
