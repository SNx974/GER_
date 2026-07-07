import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

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
      OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
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
          "Aucun admin en base : le seed n'a pas tourné. Vérifier que ADMIN_EMAIL/ADMIN_PASSWORD sont définis et que `npm start` (scripts/bootstrap-db.js) s'exécute bien au démarrage.";
      }
    } catch (e) {
      report.tables = "manquantes";
      report.tablesError =
        e instanceof Error
          ? e.message.split("\n").find((l) => l.trim().length > 0) ?? e.message
          : String(e);
      report.hint =
        "Les tables n'existent pas : `prisma db push` n'a pas été exécuté au démarrage.";
    }
  } catch (e) {
    report.database = "inaccessible";
    report.databaseError =
      e instanceof Error
        ? e.message.split("\n").find((l) => l.trim().length > 0) ?? e.message
        : String(e);
    report.hint =
      "Connexion à la base impossible : vérifier DATABASE_URL (l'URL interne ne fonctionne que si l'app est dans le même projet Dokploy que le service Postgres).";
  }

  // Vérifie que le dossier des screenshots est réellement accessible en
  // écriture (cause fréquente de 500 sur /api/upload si non monté/permissions).
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const testFile = path.join(UPLOAD_DIR, `.healthcheck-${randomUUID()}`);
    await writeFile(testFile, "ok");
    await rm(testFile);
    report.uploads = "ok";
  } catch (e) {
    report.uploads = "non accessible en écriture";
    report.uploadsError = e instanceof Error ? e.message : String(e);
    report.uploadsHint =
      "Le dossier /app/uploads n'est pas accessible en écriture. Monter un volume Dokploy sur ce chemin, ou vérifier les permissions du conteneur.";
  }

  const ok =
    dbOk && tablesOk && Boolean(process.env.NEXTAUTH_SECRET) && Boolean(process.env.DATABASE_URL);

  return NextResponse.json({ ok, ...report }, { status: ok ? 200 : 500 });
}
