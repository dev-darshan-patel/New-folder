"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { planConfig } from "@/lib/plans";
import { FONTS } from "@/lib/branding";
import { parseQuestions } from "@/lib/intake";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

// Re-send the email-verification link to the signed-in (unverified) user.
export async function resendVerificationAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (user.emailVerifiedAt) return { ok: true };
  if (!rateLimit(`verify-resend:${user.id}`, 3, 3_600_000)) {
    return { ok: false, error: "Too many resends. Try again later." };
  }
  const token = crypto.randomUUID();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: token,
      emailVerifyExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    await sendEmail({
      to: user.email,
      subject: "Verify your email address",
      text: `Hi ${user.name},\n\nConfirm your email address (valid for 24 hours):\n\n${base}/verify-email/${token}`,
    });
  } catch (err) {
    console.error("Failed to send verification email", err);
    return { ok: false, error: "Could not send the email. Try again later." };
  }
  return { ok: true };
}

// Save the full weekly availability for the current user.
// Expects, per weekday 0-6: enabled flag + start/end "HH:MM" values.
export async function saveAvailabilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const rows: { weekday: number; startMinutes: number; endMinutes: number }[] = [];

  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`enabled-${weekday}`) !== "on") continue;
    const start = toMinutes(String(formData.get(`start-${weekday}`) || ""));
    const end = toMinutes(String(formData.get(`end-${weekday}`) || ""));
    if (start === null || end === null || end <= start) continue;
    rows.push({ weekday, startMinutes: start, endMinutes: end });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: user.id } }),
    prisma.availability.createMany({
      data: rows.map((r) => ({ ...r, userId: user.id })),
    }),
  ]);

  revalidatePath("/dashboard/availability");
}

export async function createEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const title = String(formData.get("title") || "").trim();
  const duration = Number(formData.get("durationMinutes") || 30);
  const description = String(formData.get("description") || "").trim() || null;
  if (!title) return;

  // Enforce the plan's event-type limit.
  const limit = planConfig(user.plan).maxEventTypes;
  if (limit !== null) {
    const count = await prisma.eventType.count({ where: { userId: user.id } });
    if (count >= limit) {
      redirect("/dashboard/event-types?limit=1");
    }
  }

  // Build a slug unique within this user's event types.
  const root = slugify(title) || "meeting";
  let slug = root;
  let n = 1;
  while (
    await prisma.eventType.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    })
  ) {
    n += 1;
    slug = `${root}-${n}`;
  }

  await prisma.eventType.create({
    data: {
      userId: user.id,
      title,
      slug,
      description,
      durationMinutes: Number.isFinite(duration) ? duration : 30,
    },
  });

  revalidatePath("/dashboard/event-types");
}

// Save booking-page branding. Values persist on any plan but only render on
// plans where customBranding is enabled (enforced in resolveBranding).
export async function updateBrandingAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const rawColor = String(formData.get("brandColor") || "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : undefined;
  const font = String(formData.get("brandFont") || "").trim();
  const logoUrl = String(formData.get("logoUrl") || "").trim() || null;
  const welcomeMessage =
    String(formData.get("welcomeMessage") || "").trim().slice(0, 280) || null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(color ? { brandColor: color } : {}),
      ...(font && FONTS[font] ? { brandFont: font } : {}),
      logoUrl,
      welcomeMessage,
    },
  });

  revalidatePath("/dashboard/branding");
}

export async function deleteEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const id = String(formData.get("id") || "");
  await prisma.eventType.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/dashboard/event-types");
}

// Update an event type's scheduling settings + intake questions.
export async function updateEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const duration = clampInt(formData.get("durationMinutes"), 5, 1440, 30);
  const bufferMinutes = clampInt(formData.get("bufferMinutes"), 0, 100000, 0);
  const rawMax = String(formData.get("maxPerDay") || "").trim();
  const maxPerDay = rawMax === "" ? null : clampInt(rawMax, 1, 1000, 1);

  // Intake questions arrive as a JSON string from the client editor.
  const questions = parseQuestions(String(formData.get("intakeQuestions") || ""))
    .filter((q) => q.label.trim() !== "");
  const intakeQuestions = questions.length ? JSON.stringify(questions) : null;

  const rawMode = String(formData.get("assignmentMode") || "SOLO");
  const teamSchedulingEnabled = planConfig(user.plan).teamScheduling;
  const assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE" =
    teamSchedulingEnabled && (rawMode === "ROUND_ROBIN" || rawMode === "COLLECTIVE")
      ? rawMode
      : "SOLO";
  let poolMemberIds: string[] = [];
  if (assignmentMode !== "SOLO") {
    try {
      const raw = JSON.parse(String(formData.get("poolMemberIds") || "[]"));
      if (Array.isArray(raw)) poolMemberIds = raw.filter((x) => typeof x === "string");
    } catch {
      poolMemberIds = [];
    }
  }

  // Ownership enforced via the userId filter.
  await prisma.eventType.updateMany({
    where: { id, userId: user.id },
    data: {
      ...(title ? { title } : {}),
      description,
      durationMinutes: duration,
      bufferMinutes,
      maxPerDay,
      intakeQuestions,
      assignmentMode,
    },
  });

  if (assignmentMode !== "SOLO") {
    const validIds = poolMemberIds.length
      ? (
          await prisma.teamMember.findMany({
            where: { id: { in: poolMemberIds }, userId: user.id },
            select: { id: true },
          })
        ).map((m) => m.id)
      : [];
    await prisma.$transaction([
      prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } }),
      prisma.eventTypeMember.createMany({
        data: validIds.map((teamMemberId) => ({ eventTypeId: id, teamMemberId })),
      }),
    ]);
  } else {
    await prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } });
  }

  revalidatePath("/dashboard/event-types");
  redirect("/dashboard/event-types");
}

function clampInt(
  value: FormDataEntryValue | null | string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
