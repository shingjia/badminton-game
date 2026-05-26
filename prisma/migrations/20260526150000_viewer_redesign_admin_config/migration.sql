-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "bannerColor" TEXT NOT NULL DEFAULT 'red',
ADD COLUMN     "bannerIcon" TEXT NOT NULL DEFAULT '🏸';

-- CreateTable
CREATE TABLE "AdminConfig" (
    "id" INTEGER NOT NULL DEFAULT 0,
    "passwordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminConfig_pkey" PRIMARY KEY ("id")
);
