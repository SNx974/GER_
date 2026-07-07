import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Diagnostic de déploiement : GET /api/health
 * Vérifie les variables d'environnement, la connexion à la base et la
 * présence des tables/du seed. Ne révèle aucun secret (booléens uniquement).
 */
export async function GET() {
  const report: Record<string, unknown> = {
    env: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(non défini)",
      ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
      GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    },
  };

  let dbOk = false;
  let tablesOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    report.database = "ok";

    try {
      const [users, admins, maps] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.gameMap.count(),
      ]);
      tablesOk = true;
      report.tables = "ok";
      report.seed = {
        users,
        admins,
        maps,
        adminSeeded: admins > 0,
        mapsSeeded: maps > 0,
      };
      if (admins === 0) {
        report.hint =
          "Aucun admin en base : le seed n'a pas tourné. Vérifier que le build utilise le Dockerfile (docker-entrypoint.sh) et que ADMIN_EMAIL/ADMIN_PASSWORD sont définis.";
      }
    } catch (e) {
      report.tables = "manquantes";
      report.tablesError =
        e instanceof Error ? e.message.split("\n")[0] : String(e);
      report.hint =
        "Les tables n'existent pas : `prisma db push` n'a pas été exécuté. Sur Dokploy, le build doit utiliser le Dockerfile (l'entrypoint s'en charge au démarrage).";
    }
  } catch (e) {
    report.database = "inaccessible";
    report.databaseError =
      e instanceof Error ? e.message.split("\n")[0] : String(e);
    report.hint =
      "Connexion à la base impossible : vérifier DATABASE_URL (l'URL interne ne fonctionne que si l'app est dans le même projet Dokploy que le service Postgres).";
  }

  const ok =
    dbOk && tablesOk && Boolean(process.env.NEXTAUTH_SECRET) && Boolean(process.env.DATABASE_URL);

  return NextResponse.json({ ok, ...report }, { status: ok ? 200 : 500 });
}
