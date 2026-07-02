// Seeds varied demo tenants + bookings spread over the last ~60 days so the
// admin analytics dashboard shows real trends. Safe to re-run (clears its own
// seeded users by email prefix first). Does NOT touch demo@demo.com.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const businesses = [
  ["Bright Smile Dental", "PRO"],
  ["Peak Fitness Studio", "BUSINESS"],
  ["Calm Mind Therapy", "PRO"],
  ["Sharp Cuts Barber", "FREE"],
  ["Glow Skin Clinic", "PRO"],
  ["Apex Law Consult", "BUSINESS"],
  ["Green Thumb Garden", "FREE"],
  ["Pixel Web Studio", "PRO"],
  ["Harmony Yoga", "FREE"],
  ["Drive Right School", "BUSINESS"],
];

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  // Clean previous analytics seed.
  await prisma.user.deleteMany({ where: { email: { startsWith: "seed+" } } });

  const passwordHash = await bcrypt.hash("password123", 10);

  for (let i = 0; i < businesses.length; i++) {
    const [name, plan] = businesses[i];
    const signupDaysAgo = rand(2, 60);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const user = await prisma.user.create({
      data: {
        name: `Owner ${i + 1}`,
        businessName: name,
        email: `seed+${i}@example.com`,
        passwordHash,
        slug,
        timezone: "America/New_York",
        plan,
        subscriptionStatus: plan === "FREE" ? null : "active",
        planRenewsAt: plan === "FREE" ? null : daysAgo(-20),
        createdAt: daysAgo(signupDaysAgo),
        eventTypes: {
          create: { title: "30 Minute Meeting", slug: "30-min", durationMinutes: 30 },
        },
        availability: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinutes: 9 * 60,
            endMinutes: 17 * 60,
          })),
        },
      },
      include: { eventTypes: true },
    });

    const et = user.eventTypes[0];
    const bookingCount = rand(0, 14);
    for (let b = 0; b < bookingCount; b++) {
      const madeDaysAgo = rand(0, Math.min(signupDaysAgo, 30));
      // Some bookings in the future, some in the past.
      const startOffset = rand(-20, 14);
      const start = daysAgo(startOffset);
      start.setUTCHours(rand(13, 20), 0, 0, 0);
      await prisma.booking.create({
        data: {
          userId: user.id,
          eventTypeId: et.id,
          inviteeName: `Customer ${b + 1}`,
          inviteeEmail: `cust${b}@example.com`,
          startTime: start,
          endTime: new Date(start.getTime() + 30 * 60000),
          status: Math.random() < 0.12 ? "CANCELLED" : "CONFIRMED",
          manageToken: crypto.randomUUID(),
          createdAt: daysAgo(madeDaysAgo),
        },
      });
    }
  }

  const users = await prisma.user.count();
  const bookings = await prisma.booking.count();
  console.log(`Seeded analytics data. Users: ${users}, Bookings: ${bookings}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
