import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMatchReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const REMINDER_WINDOW_MS = 5 * 60 * 1000; // ±5 min autour de "30 min avant"
const TARGET_LEAD_MS = 30 * 60 * 1000;

/**
 * À appeler périodiquement (toutes les 1 à 5 minutes) par une tâche
 * planifiée externe (Dokploy Scheduled Task, cron-job.org, etc.) :
 *
 *   GET /api/cron/match-reminders?secret=<CRON_SECRET>
 *
 * Envoie un email de rappel aux deux capitaines pour chaque match dont le
 * coup d'envoi est dans ~30 minutes et pour lequel aucun rappel n'a encore
 * été envoyé (reminderSentAt évite les doublons entre deux exécutions).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 503 });
  }

  const provided = new URL(req.url).searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = Date.now();
  const target = new Date(now + TARGET_LEAD_MS);
  const windowStart = new Date(target.getTime() - REMINDER_WINDOW_MS);
  const windowEnd = new Date(target.getTime() + REMINDER_WINDOW_MS);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      scheduledAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      teamA: { select: { name: true, captain: { select: { email: true, name: true } } } },
      teamB: { select: { name: true, captain: { select: { email: true, name: true } } } },
    },
  });

  let sent = 0;
  for (const match of matches) {
    try {
      await sendMatchReminderEmail({
        to: [
          { email: match.teamA.captain.email, name: match.teamA.captain.name ?? undefined },
          { email: match.teamB.captain.email, name: match.teamB.captain.name ?? undefined },
        ],
        teamAName: match.teamA.name,
        teamBName: match.teamB.name,
        scheduledAt: match.scheduledAt,
        roomToken: match.roomToken,
      });
      await prisma.match.update({
        where: { id: match.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (e) {
      console.error(`[cron] échec du rappel pour le match ${match.id}`, e);
    }
  }

  return NextResponse.json({ ok: true, checked: matches.length, sent });
}
