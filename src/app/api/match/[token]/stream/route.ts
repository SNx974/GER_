import { prisma } from "@/lib/prisma";
import { getRoomState } from "@/lib/match-room";
import { subscribeMatch } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const match = await prisma.match.findUnique({
    where: { roomToken: params.token },
    select: { id: true },
  });
  if (!match) {
    return new Response("Match introuvable", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";
      const send = (data: unknown) => {
        const payload = JSON.stringify(data);
        lastPayload = payload;
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      // État initial
      const initial = await getRoomState(params.token);
      if (initial) send(initial);

      // Abonnement aux mises à jour temps réel (push immédiat)
      const unsubscribe = subscribeMatch(match.id, (data) => send(data));

      // Poll de secours : si le push en mémoire ne parvient pas à cette
      // instance (ex. déploiement multi-réplicas où l'action d'un capitaine
      // est traitée par une autre instance que celle qui tient sa
      // connexion SSE), on ré-interroge la base et on renvoie l'état s'il a
      // changé — garantit une mise à jour sans rechargement manuel.
      const poll = setInterval(async () => {
        try {
          const state = await getRoomState(params.token);
          if (state) {
            const payload = JSON.stringify(state);
            if (payload !== lastPayload) {
              lastPayload = payload;
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
          }
        } catch {
          // on retentera au prochain tick
        }
      }, 3000);

      // Keep-alive (commentaire SSE) pour éviter les coupures proxy
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 20000);

      // Nettoyage à la déconnexion du client
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        clearInterval(poll);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Empêche les reverse proxies (Traefik/Nginx) de bufferiser le flux
      "X-Accel-Buffering": "no",
    },
  });
}
