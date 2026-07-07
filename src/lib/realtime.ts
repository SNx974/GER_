import { EventEmitter } from "events";

/**
 * Bus d'événements en mémoire pour le temps réel (SSE) de la Match Room.
 *
 * ⚠️ Fonctionne pour un serveur Next unique (dev / self-host).
 * Pour un déploiement multi-instances (serverless), remplacer par Redis
 * pub/sub, Pusher ou Ably — l'interface publish/subscribe reste identique.
 */
type Listener = (data: unknown) => void;

const globalForBus = globalThis as unknown as {
  matchBus: EventEmitter | undefined;
};

const bus =
  globalForBus.matchBus ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // pas de limite (nombreux spectateurs possibles)
    return e;
  })();

if (process.env.NODE_ENV !== "production") globalForBus.matchBus = bus;

function channel(matchId: string) {
  return `match:${matchId}`;
}

export function publishMatchEvent(matchId: string, data: unknown) {
  bus.emit(channel(matchId), data);
}

export function subscribeMatch(matchId: string, listener: Listener) {
  const ch = channel(matchId);
  bus.on(ch, listener);
  return () => bus.off(ch, listener);
}
