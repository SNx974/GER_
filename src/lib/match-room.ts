import type {
  MatchFormat,
  MatchStatus,
  MapbanActionType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildVetoSequence, type VetoStep } from "@/lib/mapban";
import { publishMatchEvent } from "@/lib/realtime";

export type MapState = "AVAILABLE" | "BANNED" | "PICKED" | "DECIDER";

export type RoomMap = {
  id: string;
  name: string;
  imageUrl: string | null;
  state: MapState;
  byTeam: "A" | "B" | null;
};

export type RoomState = {
  matchId: string;
  token: string;
  status: MatchStatus;
  format: MatchFormat;
  scheduledAt: string;
  hasResult: boolean;
  teamA: { id: string; name: string; tag: string | null };
  teamB: { id: string; name: string; tag: string | null };
  maps: RoomMap[];
  actions: {
    order: number;
    team: "A" | "B";
    action: MapbanActionType;
    mapName: string;
  }[];
  sequence: VetoStep[];
  currentStepIndex: number;
  currentTurn: "A" | "B" | null;
  currentAction: MapbanActionType | null;
  finished: boolean;
  playedMaps: {
    order: number;
    name: string;
    isDecider: boolean;
    pickedBy: "A" | "B" | null;
  }[];
};

type FullMatch = NonNullable<Awaited<ReturnType<typeof loadMatch>>>;

function loadMatch(token: string) {
  return prisma.match.findUnique({
    where: { roomToken: token },
    include: {
      teamA: { select: { id: true, name: true, tag: true } },
      teamB: { select: { id: true, name: true, tag: true } },
      mapbanActions: { include: { map: true }, orderBy: { order: "asc" } },
      maps: { include: { map: true }, orderBy: { order: "asc" } },
      result: { select: { id: true } },
    },
  });
}

function makeLetterFn(match: { teamAId: string; teamBId: string }) {
  return (teamId: string): "A" | "B" | null =>
    teamId === match.teamAId ? "A" : teamId === match.teamBId ? "B" : null;
}

/** Construit l'état complet de la salle à partir du match chargé + pool actif. */
async function buildState(match: FullMatch): Promise<RoomState> {
  const activePool = await prisma.gameMap.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const letterOf = makeLetterFn(match);

  // Univers de maps = pool actif ∪ maps déjà utilisées dans le veto
  const universe = new Map<
    string,
    { id: string; name: string; imageUrl: string | null }
  >();
  for (const m of activePool) universe.set(m.id, m);
  for (const a of match.mapbanActions) {
    if (!universe.has(a.map.id)) universe.set(a.map.id, a.map);
  }

  const sequence = buildVetoSequence(match.format, universe.size);
  const currentStepIndex = match.mapbanActions.length;
  const finished =
    match.status === "READY" ||
    match.status === "COMPLETED" ||
    currentStepIndex >= sequence.length;

  const currentStep = finished ? null : sequence[currentStepIndex] ?? null;

  // État par map
  const bannedIds = new Set<string>();
  const pickedBy = new Map<string, "A" | "B">();
  for (const a of match.mapbanActions) {
    if (a.action === "BAN") bannedIds.add(a.mapId);
    else pickedBy.set(a.mapId, letterOf(a.teamId) ?? "A");
  }

  const maps: RoomMap[] = [...universe.values()].map((m) => {
    if (bannedIds.has(m.id)) {
      return { ...m, state: "BANNED" as const, byTeam: null };
    }
    const pb = pickedBy.get(m.id);
    if (pb) return { ...m, state: "PICKED" as const, byTeam: pb };
    // map restante après tous les vetos = decider
    if (finished) return { ...m, state: "DECIDER" as const, byTeam: null };
    return { ...m, state: "AVAILABLE" as const, byTeam: null };
  });

  return {
    matchId: match.id,
    token: match.roomToken,
    status: match.status,
    format: match.format,
    scheduledAt: match.scheduledAt.toISOString(),
    hasResult: !!match.result,
    teamA: match.teamA,
    teamB: match.teamB,
    maps,
    actions: match.mapbanActions.map((a) => ({
      order: a.order,
      team: letterOf(a.teamId) ?? "A",
      action: a.action,
      mapName: a.map.name,
    })),
    sequence,
    currentStepIndex,
    currentTurn: currentStep?.team ?? null,
    currentAction: currentStep?.action ?? null,
    finished,
    playedMaps: match.maps.map((mm) => ({
      order: mm.order,
      name: mm.map.name,
      isDecider: mm.isDecider,
      pickedBy: mm.pickedByTeamId ? letterOf(mm.pickedByTeamId) : null,
    })),
  };
}

export async function getRoomState(token: string): Promise<RoomState | null> {
  const match = await loadMatch(token);
  if (!match) return null;
  return buildState(match);
}

/**
 * Ouvre le mapban si l'heure du match est atteinte (SCHEDULED → MAPBAN).
 * Si le pool ne contient qu'une map, passe directement en READY (decider).
 * Idempotent : ne fait rien si le mapban est déjà lancé.
 */
export async function startMapbanIfDue(token: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { roomToken: token },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      format: true,
      teamAId: true,
      teamBId: true,
    },
  });
  if (!match || match.status !== "SCHEDULED") return;
  if (Date.now() < match.scheduledAt.getTime()) return;

  const pool = await prisma.gameMap.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  const sequence = buildVetoSequence(match.format, pool.length);

  if (sequence.length === 0) {
    // Une seule map → decider direct
    const decider = pool[0];
    if (!decider) return;
    await prisma.$transaction([
      prisma.matchMap.create({
        data: {
          matchId: match.id,
          mapId: decider.id,
          order: 1,
          isDecider: true,
        },
      }),
      prisma.match.update({
        where: { id: match.id },
        data: { status: "READY", currentTurnTeamId: null },
      }),
    ]);
  } else {
    const firstTeamId = sequence[0]!.team === "A" ? match.teamAId : match.teamBId;
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "MAPBAN", currentTurnTeamId: firstTeamId },
    });
  }

  const state = await getRoomState(token);
  if (state) publishMatchEvent(match.id, state);
}

/** Finalise le mapban : crée les MatchMap (picks + decider) et passe en READY. */
async function finalizeMapban(token: string): Promise<void> {
  const match = await loadMatch(token);
  if (!match) return;

  const letterOf = makeLetterFn(match);

  const activePool = await prisma.gameMap.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const universeIds = new Set<string>(activePool.map((m) => m.id));
  for (const a of match.mapbanActions) universeIds.add(a.mapId);

  const picks = match.mapbanActions.filter((a) => a.action === "PICK");
  const bannedOrPicked = new Set(match.mapbanActions.map((a) => a.mapId));
  const deciderId = [...universeIds].find((id) => !bannedOrPicked.has(id));

  const rows: {
    matchId: string;
    mapId: string;
    order: number;
    isDecider: boolean;
    pickedByTeamId: string | null;
  }[] = picks.map((p, i) => ({
    matchId: match.id,
    mapId: p.mapId,
    order: i + 1,
    isDecider: false,
    pickedByTeamId: p.teamId,
  }));
  if (deciderId) {
    rows.push({
      matchId: match.id,
      mapId: deciderId,
      order: rows.length + 1,
      isDecider: true,
      pickedByTeamId: null,
    });
  }

  await prisma.$transaction([
    prisma.matchMap.createMany({ data: rows }),
    prisma.match.update({
      where: { id: match.id },
      data: { status: "READY", currentTurnTeamId: null },
    }),
  ]);

  const state = await getRoomState(token);
  if (state) publishMatchEvent(match.id, state);
}

export { finalizeMapban, buildState, loadMatch, makeLetterFn };
