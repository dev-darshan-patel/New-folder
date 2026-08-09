-- CreateTable
CREATE TABLE "SlugAlias" (
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugAlias_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "SlugAlias_userId_idx" ON "SlugAlias"("userId");

-- AddForeignKey
ALTER TABLE "SlugAlias" ADD CONSTRAINT "SlugAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
