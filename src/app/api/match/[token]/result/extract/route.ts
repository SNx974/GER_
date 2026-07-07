import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { extractStatsFromScreenshots } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Tente une extraction automatique des stats joueurs depuis des screenshots
 * déjà uploadés (reconnaissance d'image via OpenRouter). Utilisée par le
 * formulaire de résultat comme pré-remplissage optionnel — si l'IA ne
 * détecte rien, la saisie manuelle reste le repli normal.
 */
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const match = await prisma.match.findUnique({
    where: { roomToken: params.token },
    select: {
      teamAId: true,
      teamBId: true,
      teamA: {
        select: {
          players: { where: { isActive: true }, select: { id: true, pseudo: true } },
        },
      },
      teamB: {
        select: {
          players: { where: { isActive: true }, select: { id: true, pseudo: true } },
        },
      },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match introuvable" }, { status: 404 });
  }

  const myTeamId = session.user.teamId;
  const isParticipant = myTeamId === match.teamAId || myTeamId === match.teamBId;
  if (session.user.role !== "CAPTAIN" || !isParticipant) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const screenshots = (body as { screenshots?: unknown }).screenshots;
  if (!Array.isArray(screenshots) || screenshots.some((s) => typeof s !== "string")) {
    return NextResponse.json({ error: "Liste de screenshots invalide" }, { status: 422 });
  }

  const roster = [...match.teamA.players, ...match.teamB.players];
  const stats = await extractStatsFromScreenshots(screenshots as string[], roster);

  return NextResponse.json({ stats, found: stats.length > 0 });
}
