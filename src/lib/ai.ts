/**
 * Analyse IA des résultats de match (reconnaissance d'image + cohérence stats).
 *
 * - Si OPENROUTER_API_KEY est défini : appel à OpenRouter (API unifiée,
 *   compatible OpenAI) avec un modèle vision gratuit — par défaut Gemma 4
 *   31B — pour lire les screenshots de tableaux des scores et détecter des
 *   anomalies / en extraire les stats.
 * - Sinon : repli heuristique local pour que le flux reste fonctionnel.
 *
 * Le résultat est stocké tel quel dans MatchResult.aiAnalysis (JSON).
 */

export type PlayerStatInput = {
  playerId: string;
  pseudo?: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
};

export type MapStatInput = {
  mapName?: string;
  scoreA: number;
  scoreB: number;
  stats: PlayerStatInput[];
};

export type AiAnalysis = {
  provider: "openrouter" | "heuristic";
  flagged: boolean;
  summary: string;
  anomalies: string[];
  raw?: unknown;
};

const KILLS_MAX_PLAUSIBLE = 50; // par map
const SCORE_DIFF_MAX = 5; // écart toléré total kills vs total morts sur une map
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

function heuristicAnalysis(maps: MapStatInput[]): AiAnalysis {
  const anomalies: string[] = [];

  for (const [i, map] of maps.entries()) {
    const label = map.mapName ?? `Map ${i + 1}`;
    let totalKills = 0;
    let totalDeaths = 0;

    for (const s of map.stats) {
      const who = s.pseudo ?? s.playerId;
      if (s.kills < 0 || s.deaths < 0 || s.assists < 0) {
        anomalies.push(`${label} — valeurs négatives pour ${who}.`);
      }
      if (s.kills > KILLS_MAX_PLAUSIBLE) {
        anomalies.push(
          `${label} — ${who} affiche ${s.kills} kills (anormalement élevé).`
        );
      }
      if (s.deaths === 0 && s.kills >= 20) {
        anomalies.push(
          `${label} — ${who} : ${s.kills} kills sans aucune mort (à vérifier).`
        );
      }
      totalKills += Math.max(0, s.kills);
      totalDeaths += Math.max(0, s.deaths);
    }

    if (map.stats.length > 0 && Math.abs(totalKills - totalDeaths) > SCORE_DIFF_MAX) {
      anomalies.push(
        `${label} — incohérence : ${totalKills} kills pour ${totalDeaths} morts au total.`
      );
    }
  }

  return {
    provider: "heuristic",
    flagged: anomalies.length > 0,
    summary:
      anomalies.length > 0
        ? `${anomalies.length} anomalie(s) potentielle(s) détectée(s) par l'analyse automatique.`
        : "Aucune anomalie évidente détectée par l'analyse automatique.",
    anomalies,
  };
}

/**
 * Résout un chemin interne (/api/uploads/xxx) en URL absolue joignable en
 * boucle locale — nécessaire car `fetch` côté serveur n'a pas de base URL.
 */
function resolveInternalUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}${url}`;
}

/** Télécharge une image et la convertit en data URL base64 (format OpenAI/OpenRouter). */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(resolveInternalUrl(url));
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Extrait un objet JSON de la réponse d'un modèle, même s'il est entouré de
 * texte ou de balises markdown ```json ... ``` — les modèles gratuits ne
 * respectent pas toujours strictement le format demandé.
 */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // on tente d'autres stratégies ci-dessous
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // ignore
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // ignore
    }
  }

  throw new Error("Réponse IA non exploitable (JSON introuvable)");
}

type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Construit le contenu multimodal (texte + images) pour un appel OpenRouter. */
async function buildVisionContent(
  prompt: string,
  screenshots: string[]
): Promise<VisionContentPart[]> {
  const content: VisionContentPart[] = [{ type: "text", text: prompt }];
  for (const url of screenshots.slice(0, 4)) {
    const dataUrl = await fetchImageAsDataUrl(url);
    if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl } });
  }
  return content;
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  content: VisionContentPart[]
): Promise<unknown> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": "GER Esport Manager",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Réponse OpenRouter vide");
  return extractJson(text);
}

async function openRouterAnalysis(
  apiKey: string,
  model: string,
  screenshots: string[],
  maps: MapStatInput[]
): Promise<AiAnalysis> {
  const prompt =
    "Tu es un analyste anti-triche esport (FPS tactique type Valorant/CS). " +
    "Compare les statistiques déclarées avec les screenshots des tableaux des " +
    "scores. Détecte les incohérences et anomalies : chiffres ne correspondant " +
    "pas aux images, scores impossibles, ratio kills/morts irréaliste, écart " +
    "entre total des kills et total des morts. " +
    'Réponds STRICTEMENT en JSON, sans aucun texte autour : {"flagged": boolean, "summary": string, "anomalies": string[]}. ' +
    "Statistiques déclarées : " +
    JSON.stringify(maps);

  const content = await buildVisionContent(prompt, screenshots);
  const parsed = (await callOpenRouter(apiKey, model, content)) as {
    flagged?: boolean;
    summary?: string;
    anomalies?: string[];
  };

  return {
    provider: "openrouter",
    flagged: Boolean(parsed.flagged),
    summary: parsed.summary ?? "Analyse effectuée.",
    anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
    raw: parsed,
  };
}

export async function analyzeResult(
  screenshots: string[],
  maps: MapStatInput[]
): Promise<AiAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return heuristicAnalysis(maps);

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  try {
    return await openRouterAnalysis(apiKey, model, screenshots, maps);
  } catch (e) {
    // En cas d'erreur API, on retombe sur l'heuristique (flux non bloquant)
    const fallback = heuristicAnalysis(maps);
    fallback.summary = `IA indisponible (${
      e instanceof Error ? e.message : "erreur"
    }) — analyse heuristique appliquée. ${fallback.summary}`;
    return fallback;
  }
}

// ─────────────────────────────────────────────
// Extraction automatique des stats depuis les screenshots
// ─────────────────────────────────────────────

export type ExtractedStat = {
  playerId: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
};

export type RosterPlayer = { id: string; pseudo: string };

/**
 * Tente d'extraire les statistiques des joueurs depuis les screenshots
 * fournis (reconnaissance d'image via OpenRouter). Ne renvoie que les
 * lignes rattachées avec certitude à un pseudo de l'effectif connu — le
 * reste doit être saisi manuellement par les capitaines.
 *
 * Renvoie un tableau vide si aucune clé OpenRouter n'est configurée, si
 * aucun screenshot n'est exploitable, ou si l'IA ne détecte rien (cas "l'IA
 * ne trouve pas" → repli sur la saisie manuelle déjà prévue dans le formulaire).
 */
export async function extractStatsFromScreenshots(
  screenshots: string[],
  roster: RosterPlayer[]
): Promise<ExtractedStat[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || screenshots.length === 0 || roster.length === 0) return [];

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  try {
    const rosterList = roster.map((p) => p.pseudo).join(", ");
    const prompt =
      "Tu lis un ou plusieurs screenshots de tableau des scores d'un match " +
      "esport (FPS tactique type Valorant/CS). Effectif connu des deux " +
      `équipes : ${rosterList}. ` +
      "Pour chaque joueur du tableau que tu identifies avec certitude parmi " +
      "cet effectif, extrait ses statistiques (kills, morts, assists, score). " +
      "Ignore toute ligne que tu ne peux pas rattacher clairement à un pseudo " +
      "de cette liste. " +
      'Réponds STRICTEMENT en JSON, sans aucun texte autour : {"players": [{"pseudo": string, "kills": number, "deaths": number, "assists": number, "score": number}]}.';

    const content = await buildVisionContent(prompt, screenshots);
    if (content.length === 1) return []; // aucune image exploitable

    const parsed = (await callOpenRouter(apiKey, model, content)) as {
      players?: {
        pseudo?: string;
        kills?: number;
        deaths?: number;
        assists?: number;
        score?: number;
      }[];
    };

    const results: ExtractedStat[] = [];
    for (const p of parsed.players ?? []) {
      if (!p.pseudo) continue;
      const match = roster.find(
        (r) => r.pseudo.trim().toLowerCase() === p.pseudo!.trim().toLowerCase()
      );
      if (!match) continue;
      results.push({
        playerId: match.id,
        kills: Math.max(0, Math.round(p.kills ?? 0)),
        deaths: Math.max(0, Math.round(p.deaths ?? 0)),
        assists: Math.max(0, Math.round(p.assists ?? 0)),
        score: Math.max(0, Math.round(p.score ?? 0)),
      });
    }
    return results;
  } catch (e) {
    console.error("extractStatsFromScreenshots error", e);
    return [];
  }
}
