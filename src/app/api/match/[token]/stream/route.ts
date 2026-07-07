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
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // État initial
      const initial = await getRoomState(params.token);
      if (initial) send(initial);

      // Abonnement aux mises à jour temps réel
      const unsubscribe = subscribeMatch(match.id, (data) => send(data));

      // Keep-alive (commentaire SSE) pour éviter les coupures proxy
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25000);

      // Nettoyage à la déconnexion du client
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
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
    },
  });
}
