import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 heure

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalide" }, { status: 422 });
  }

  const { email } = parsed.data;

  // Réponse toujours identique, qu'un compte existe ou non (anti-énumération).
  const genericResponse = NextResponse.json({
    ok: true,
    message:
      "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.",
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user || !user.passwordHash) return genericResponse;

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    prisma.verificationToken.create({
      data: { identifier: email, token, expires: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);

  const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?email=${encodeURIComponent(
    email
  )}&token=${token}`;

  await sendPasswordResetEmail({
    to: { email: user.email, name: user.name ?? undefined },
    resetUrl,
  });

  return genericResponse;
}
