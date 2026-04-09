-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "hours_justification" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "utm_source" TEXT;

-- CreateTable
CREATE TABLE "historical_metrics" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_metrics_metric_idx" ON "historical_metrics"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "historical_metrics_date_metric_key" ON "historical_metrics"("date", "metric");
