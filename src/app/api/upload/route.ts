import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Répertoire hors de `public/` : à monter en volume persistant sur Dokploy
// (sinon les screenshots sont perdus à chaque redéploiement).
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  // Tout le corps est protégé : aucune exception ne doit jamais produire
  // la page d'erreur HTML par défaut de Next (illisible côté client).
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    // `file` est un Blob/File selon l'implémentation FormData du runtime ;
    // on lit `type`/`size`/`arrayBuffer` directement plutôt que de reposer
    // sur `instanceof File`, potentiellement peu fiable selon le bundling.
    const fileType = (file as File).type;
    const fileSize = (file as File).size;

    const ext = ALLOWED_TYPES[fileType];
    if (!ext) {
      return NextResponse.json(
        {
          error: "Format non supporté (PNG, JPG, WEBP ou GIF uniquement)",
          detail: `type reçu : "${fileType || "inconnu"}"`,
        },
        { status: 415 }
      );
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (8 Mo maximum)" },
        { status: 413 }
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    return NextResponse.json({ url: `/api/uploads/${filename}` }, { status: 201 });
  } catch (e) {
    console.error("upload error", e);
    return NextResponse.json(
      {
        error: "Échec de l'envoi du fichier (erreur serveur).",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
