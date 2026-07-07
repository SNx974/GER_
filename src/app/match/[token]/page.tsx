import { notFound } from "next/navigation";
import { auth } from "@/lib/session";
import { getRoomState, startMapbanIfDue } from "@/lib/match-room";
import { MatchRoom } from "./match-room";

export const dynamic = "force-dynamic";

export default async function MatchRoomPage({
  params,
}: {
  params: { token: string };
}) {
  // Ouvre le mapban si l'heure du match est atteinte
  await startMapbanIfDue(params.token);

  const state = await getRoomState(params.token);
  if (!state) notFound();

  // Détermine le rôle du spectateur (capitaine A/B ou simple spectateur)
  const session = await auth();
  const myTeamId = session?.user.teamId ?? null;
  const viewerLetter: "A" | "B" | null =
    myTeamId === state.teamA.id
      ? "A"
      : myTeamId === state.teamB.id
        ? "B"
        : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Salle de Match</h1>
        <p className="text-sm text-muted-foreground">
          Mapban en direct · lien unique de la partie
        </p>
      </div>
      <MatchRoom
        token={params.token}
        initialState={state}
        viewerLetter={viewerLetter}
      />
    </main>
  );
}
