"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";

export async function recoverAccountAction(token: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { recoveryToken: token } });
  if (!user || !user.deletedAt || (user.purgeScheduledAt && user.purgeScheduledAt.getTime() < Date.now())) {
    redirect(`/recover/${token}?error=invalid`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: null,
      purgeScheduledAt: null,
      recoveryToken: null,
      deletionRequestedAt: null,
    },
  });

  try {
    const mail = await renderTemplate("account.recovered", {
      user_name: user.name,
      login_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`,
    });
    await sendEmail({ to: user.email, ...mail });
  } catch (err) {
    console.error("Failed to send account-recovered email", err);
  }

  redirect("/login?recovered=1");
}
