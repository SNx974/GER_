import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators/auth";
import { sendRegistrationWelcomeEmail } from "@/lib/email";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { email, password, captainName, teamName, teamTag } = parsed.data;
  const tag = teamTag ? teamTag.toUpperCase() : null;

  try {
    // Vérifs d'unicité explicites pour des messages clairs
    const [existingUser, existingTeamName, existingTag] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.team.findUnique({ where: { name: teamName } }),
      tag ? prisma.team.findUnique({ where: { tag } }) : Promise.resolve(null),
    ]);

    if (existingUser) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }
    if (existingTeamName) {
      return NextResponse.json({ error: "Ce nom d'équipe est déjà pris" }, { status: 409 });
    }
    if (existingTag) {
      return NextResponse.json({ error: "Ce tag d'équipe est déjà pris" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Le compte capitaine + son espace équipe sont créés atomiquement
    const user = await prisma.user.create({
      data: {
        email,
        name: captainName,
        passwordHash,
        role: Role.CAPTAIN,
        team: {
          create: {
            name: teamName,
            tag,
          },
        },
      },
      select: { id: true, email: true, team: { select: { id: true, name: true } } },
    });

    await sendRegistrationWelcomeEmail({
      to: { email: user.email, name: captainName },
      captainName,
      teamName,
    });

    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: "Un compte ou une équipe avec ces informations existe déjà" },
          { status: 409 }
        );
      }
      if (e.code === "P2021") {
        console.error("register error: table manquante en base", e);
        return NextResponse.json(
          {
            error:
              "Base de données non initialisée (tables manquantes). Contactez l'administrateur du site.",
          },
          { status: 503 }
        );
      }
    }
    console.error("register error", e);
    return NextResponse.json(
      { error: "Erreur serveur, veuillez réessayer plus tard." },
      { status: 500 }
    );
  }
}
