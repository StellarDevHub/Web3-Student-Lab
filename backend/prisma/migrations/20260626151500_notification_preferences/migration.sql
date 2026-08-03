-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseUpdates" BOOLEAN NOT NULL DEFAULT true,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "newCourses" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'immediate',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_studentId_key" ON "notification_preferences"("studentId");

-- CreateIndex
CREATE INDEX "notification_preferences_studentId_idx" ON "notification_preferences"("studentId");

-- CreateIndex
CREATE INDEX "notification_preferences_workspaceId_studentId_idx" ON "notification_preferences"("workspaceId", "studentId");
