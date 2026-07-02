-- CreateTable
CREATE TABLE "announcements" (
    "announcement_id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "preview_text" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "show_on_open" BOOLEAN NOT NULL DEFAULT false,
    "show_as_tag" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "event_slugs" TEXT[],

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("announcement_id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "announcement_id" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_is_active_created_at_idx" ON "announcements"("is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "announcement_reads_announcement_id_idx" ON "announcement_reads"("announcement_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_user_id_announcement_id_key" ON "announcement_reads"("user_id", "announcement_id");

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("announcement_id") ON DELETE CASCADE ON UPDATE CASCADE;
