import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@demo.com";
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({
    data: {
      name: "Demo Owner",
      businessName: "Demo Salon",
      email,
      passwordHash,
      adminRole: "SUPER_ADMIN",
      isAdmin: true,
      slug: "demo-salon",
      timezone: "America/New_York",
      eventTypes: {
        create: [
          {
            title: "30 Minute Meeting",
            slug: "30-min",
            durationMinutes: 30,
            description: "A quick 30 minute call.",
          },
          {
            title: "60 Minute Consultation",
            slug: "60-min",
            durationMinutes: 60,
          },
        ],
      },
      availability: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
        })),
      },
    },
  });

  console.log("Seeded demo account:");
  console.log("  login: demo@demo.com / password123");
  console.log("  role: SUPER_ADMIN");
  console.log(`  booking page: /${user.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
