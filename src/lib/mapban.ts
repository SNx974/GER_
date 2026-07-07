import type { MatchFormat, MapbanActionType } from "@prisma/client";
import { MAPS_TO_PLAY } from "@/lib/constants";

export type VetoStep = { team: "A" | "B"; action: MapbanActionType };

/**
 * Génère la séquence de veto pour un format et un nombre de maps du pool.
 *
 * Modèle : BANs d'ouverture alternés (A commence), puis PICKs alternés,
 * la dernière map restante devenant le Decider.
 * Invariant : bans + picks + 1 (decider) = mapCount.
 *
 * Exemples (pool de 7) :
 *  - BO1 → 6 bans, decider (1 map jouée)
 *  - BO3 → 4 bans, 2 picks, decider (3 maps jouées)
 *  - BO5 → 2 bans, 4 picks, decider (5 maps jouées)
 */
export function buildVetoSequence(
  format: MatchFormat,
  mapCount: number
): VetoStep[] {
  if (mapCount <= 1) return [];

  let mapsPlayed = Math.min(MAPS_TO_PLAY[format], mapCount);
  if (mapsPlayed % 2 === 0) mapsPlayed -= 1; // garder un nombre impair (decider net)
  if (mapsPlayed < 1) mapsPlayed = 1;

  const bans = mapCount - mapsPlayed;
  const picks = mapsPlayed - 1;

  const steps: VetoStep[] = [];
  let turn: "A" | "B" = "A";
  const pushAlternate = (action: MapbanActionType, count: number) => {
    for (let i = 0; i < count; i++) {
      steps.push({ team: turn, action });
      turn = turn === "A" ? "B" : "A";
    }
  };

  pushAlternate("BAN", bans);
  pushAlternate("PICK", picks);
  return steps;
}
