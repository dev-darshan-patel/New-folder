import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const updated = await prisma.user.updateMany({
  where: { stripeCustomerId: "cus_UpMkiVrZSVrJ5S" },
  data: { cancelAtPeriodEnd: true },
});
console.log("Updated rows:", updated.count);
await prisma.$disconnect();
