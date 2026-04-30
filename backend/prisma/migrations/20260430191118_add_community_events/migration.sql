-- CreateTable
CREATE TABLE "community_events" (
    "community_event_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "start" TIMESTAMPTZ(6) NOT NULL,
    "end" TIMESTAMPTZ(6) NOT NULL,
    "tagline" VARCHAR(300),
    "join_info" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_events_pkey" PRIMARY KEY ("community_event_id")
);

-- CreateIndex
CREATE INDEX "community_events_start_idx" ON "community_events"("start");
