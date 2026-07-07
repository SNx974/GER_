import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/session";

export const dynamic = "force-dynamic";

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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Format non supporté (PNG, JPG, WEBP ou GIF uniquement)" },
      { status: 415 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (8 Mo maximum)" },
      { status: 413 }
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ url: `/api/uploads/${filename}` }, { status: 201 });
}
