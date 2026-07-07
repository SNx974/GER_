#!/usr/bin/env node
/**
 * Bootstrap exécuté avant le démarrage de Next.js (voir "start" dans package.json).
 *
 * Certaines plateformes de déploiement (dont Dokploy) peuvent démarrer le
 * conteneur avec leur propre commande, en ignorant le CMD/entrypoint du
 * Dockerfile. En branchant l'initialisation directement sur le script
 * "start" de package.json, elle s'exécute quel que soit le lanceur utilisé.
 *
 * Étapes : attend que la base soit joignable (retry sur `prisma db push`),
 * applique le schéma, puis lance le seed (idempotent : admin + maps + réglages).
 */
const { execSync } = require("child_process");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

console.log("[bootstrap] Synchronisation du schéma (prisma db push)…");
let pushed = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    run("npx prisma db push --skip-generate --accept-data-loss");
    pushed = true;
    break;
  } catch (e) {
    if (attempt === MAX_ATTEMPTS) {
      console.error(
        `[bootstrap] ❌ échec après ${MAX_ATTEMPTS} tentatives :`,
        e.message
      );
    } else {
      console.log(
        `[bootstrap]   … échec (tentative ${attempt}/${MAX_ATTEMPTS}), nouvel essai dans ${
          RETRY_DELAY_MS / 1000
        }s`
      );
      sleep(RETRY_DELAY_MS);
    }
  }
}

if (pushed) {
  try {
    console.log("[bootstrap] Seed (idempotent : admin + maps + réglages)…");
    run("npx prisma db seed");
  } catch (e) {
    console.error("[bootstrap] échec du seed :", e.message);
  }
} else {
  console.error(
    "[bootstrap] Schéma non synchronisé — le seed est ignoré. L'app démarre quand même (voir /api/health pour diagnostiquer)."
  );
}
