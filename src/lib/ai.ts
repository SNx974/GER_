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

/** Télécharge une image et la convertit en base64 (pour l'envoi inline à Gemini). */
async function fetchImageAsInline(
  url: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url);
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
