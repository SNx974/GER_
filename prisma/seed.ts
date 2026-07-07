import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Pool de maps par défaut (FPS tactique — style Valorant).
// Modifiable ensuite par l'admin via le module de paramètres.
const DEFAULT_MAPS = [
  "Ascent",
  "Bind",
  "Haven",
  "Split",
  "Icebox",
  "Lotus",
  "Sunset",
];

async function main() {
  // 1. Paramètres globaux (singleton) — limite de joueurs par défaut = 7
  await prisma.globalSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", maxPlayersPerTeam: 7 },
  });

  // 2. Admin initial
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans le fichier .env"
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN },
    create: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // 3. Pool de maps
  for (const mapName of DEFAULT_MAPS) {
    await prisma.gameMap.upsert({
      where: { name: mapName },
      update: {},
      create: { name: mapName, isActive: true },
    });
  }

  console.log("✅ Seed terminé");
  console.log(`   → Admin : ${admin.email}`);
  console.log(`   → Maps  : ${DEFAULT_MAPS.join(", ")}`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur de seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
