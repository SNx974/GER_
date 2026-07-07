/**
 * Analyse IA des résultats de match (reconnaissance d'image + cohérence stats).
 *
 * - Si GEMINI_API_KEY est défini : appel à l'API Google Gemini (lecture des
 *   screenshots de tableaux des scores + détection d'anomalies).
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
  provider: "gemini" | "heuristic";
  flagged: boolean;
  summary: string;
  anomalies: string[];
  raw?: unknown;
};

const KILLS_MAX_PLAUSIBLE = 50; // par map
const SCORE_DIFF_MAX = 5; // écart toléré total kills vs total morts sur une map

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

/** Télécharge une image et la convertit en base64 (pour l'envoi inline à Gemini). */
async function fetchImageAsInline(
  url: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(resolveInternalUrl(url));
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

async function geminiAnalysis(
  apiKey: string,
  screenshots: string[],
  maps: MapStatInput[]
): Promise<AiAnalysis> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt =
    "Tu es un analyste anti-triche esport (FPS tactique type Valorant/CS). " +
    "Compare les statistiques déclarées avec les screenshots des tableaux des " +
    "scores. Détecte les incohérences et anomalies : chiffres ne correspondant " +
    "pas aux images, scores impossibles, ratio kills/morts irréaliste, écart " +
    "entre total des kills et total des morts. " +
    'Réponds STRICTEMENT en JSON : {"flagged": boolean, "summary": string, "anomalies": string[]}. ' +
    "Statistiques déclarées : " +
    JSON.stringify(maps);

  const parts: unknown[] = [{ text: prompt }];

  // Reconnaissance d'image : on joint les screenshots en inline base64
  for (const url of screenshots.slice(0, 4)) {
    const inline = await fetchImageAsInline(url);
    if (inline) {
      parts.push({
        inline_data: { mime_type: inline.mimeType, data: inline.data },
      });
    }
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as {
    flagged?: boolean;
    summary?: string;
    anomalies?: string[];
  };

  return {
    provider: "gemini",
    flagged: Boolean(parsed.flagged),
    summary: parsed.summary ?? "Analyse Gemini effectuée.",
    anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
    raw: parsed,
  };
}

export async function analyzeResult(
  screenshots: string[],
  maps: MapStatInput[]
): Promise<AiAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return heuristicAnalysis(maps);

  try {
    return await geminiAnalysis(apiKey, screenshots, maps);
  } catch (e) {
    // En cas d'erreur API, on retombe sur l'heuristique (flux non bloquant)
    const fallback = heuristicAnalysis(maps);
    fallback.summary = `IA Gemini indisponible (${
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
 * fournis (reconnaissance d'image via Gemini). Ne renvoie que les lignes
 * rattachées avec certitude à un pseudo de l'effectif connu — le reste
 * doit être saisi manuellement par les capitaines.
 *
 * Renvoie un tableau vide si aucune clé Gemini n'est configurée, si aucun
 * screenshot n'est exploitable, ou si l'IA ne détecte rien (cas "l'IA ne
 * trouve pas" → repli sur la saisie manuelle déjà prévue dans le formulaire).
 */
export async function extractStatsFromScreenshots(
  screenshots: string[],
  roster: RosterPlayer[]
): Promise<ExtractedStat[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || screenshots.length === 0 || roster.length === 0) return [];

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const rosterList = roster.map((p) => p.pseudo).join(", ");
    const prompt =
      "Tu lis un ou plusieurs screenshots de tableau des scores d'un match " +
      "esport (FPS tactique type Valorant/CS). Effectif connu des deux " +
      `équipes : ${rosterList}. ` +
      "Pour chaque joueur du tableau que tu identifies avec certitude parmi " +
      "cet effectif, extrait ses statistiques (kills, morts, assists, score). " +
      "Ignore toute ligne que tu ne peux pas rattacher clairement à un pseudo " +
      "de cette liste. " +
      'Réponds STRICTEMENT en JSON : {"players": [{"pseudo": string, "kills": number, "deaths": number, "assists": number, "score": number}]}.';

    const parts: unknown[] = [{ text: prompt }];
    for (const url of screenshots.slice(0, 4)) {
      const inline = await fetchImageAsInline(url);
      if (inline) {
        parts.push({
          inline_data: { mime_type: inline.mimeType, data: inline.data },
        });
      }
    }
    if (parts.length === 1) return []; // aucune image exploitable

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as {
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
