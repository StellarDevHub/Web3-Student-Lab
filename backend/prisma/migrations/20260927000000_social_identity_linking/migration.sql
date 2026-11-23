ALTER TABLE "students" ADD COLUMN "discordId" TEXT;
ALTER TABLE "students" ADD COLUMN "discordUsername" TEXT;

CREATE UNIQUE INDEX "students_discordId_key" ON "students"("discordId");
CREATE INDEX "students_discordId_idx" ON "students"("discordId");