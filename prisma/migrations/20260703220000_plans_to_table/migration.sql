-- Convert User.plan and Coupon.grantPlan from the `Plan` enum to text (values
-- preserved), drop the enum, and add the admin-editable `Plan` table.

-- 1. Drop the enum-typed default before altering the column type.
ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;

-- 2. Cast the enum columns to text in place (FREE/PRO/BUSINESS preserved).
ALTER TABLE "User" ALTER COLUMN "plan" TYPE TEXT USING "plan"::text;
ALTER TABLE "Coupon" ALTER COLUMN "grantPlan" TYPE TEXT USING "grantPlan"::text;

-- 3. Restore the default as a plain text literal.
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';

-- 4. Drop the now-unused enum type (frees the "Plan" name for the table).
DROP TYPE "Plan";

-- 5. Admin-editable plan definitions.
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceLabel" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "maxEventTypes" INTEGER,
    "customBranding" BOOLEAN NOT NULL DEFAULT false,
    "teamScheduling" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT[],
    "stripePriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
