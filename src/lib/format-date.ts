/**
 * Formatage de dates centralisé, toujours en heure de Paris.
 *
 * `Date.prototype.toLocaleString` sans `timeZone` explicite utilise le
 * fuseau de la machine qui exécute le code — côté client, c'est le
 * navigateur du visiteur (souvent correct par coïncidence pour un public
 * français), mais côté serveur (composants serveur Next.js), c'est le
 * fuseau du conteneur Docker (Dokploy tourne généralement en UTC), ce qui
 * décalait l'affichage des dates de plusieurs heures. En fixant
 * `timeZone: "Europe/Paris"` partout, l'affichage est correct et cohérent
 * quel que soit l'endroit où le code s'exécute.
 */
const TIME_ZONE = "Europe/Paris";

export function formatDateTime(
  date: Date | string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("fr-FR", { ...opts, timeZone: TIME_ZONE });
}
