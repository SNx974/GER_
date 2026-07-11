import type { NotificationType } from "@prisma/client";

type Payload = Record<string, unknown> | null;

function str(p: Payload, key: string): string | undefined {
  const v = p?.[key];
  return typeof v === "string" ? v : undefined;
}

/** Transforme une notification (type + payload) en texte lisible. */
export function formatNotification(
  type: NotificationType,
  payload: Payload
): string {
  switch (type) {
    case "PROPOSAL_RECEIVED":
      return `Nouvelle proposition de match de ${
        str(payload, "fromTeam") ?? "une équipe"
      }.`;
    case "PROPOSAL_ACCEPTED":
      return `${str(payload, "byTeam") ?? "L'équipe adverse"} a accepté votre proposition.`;
    case "PROPOSAL_REFUSED":
      return `${str(payload, "byTeam") ?? "L'équipe adverse"} a refusé votre proposition.`;
    case "MATCH_READY":
      return "Un match est prêt : la salle de mapban est ouverte.";
    case "RESULT_SUBMITTED":
      return "Un résultat de match a été soumis et attend validation.";
    case "RESULT_VALIDATED":
      return "Un résultat de match a été validé.";
    case "ASSIGNMENT_CREATED":
      return `Un admin a attribué un match contre ${
        str(payload, "opponentTeam") ?? "une équipe"
      } : trouvez une date dans la fenêtre proposée.`;
    case "ASSIGNMENT_DATE_PROPOSED":
      return `${str(payload, "byTeam") ?? "L'équipe adverse"} propose une date pour votre match attribué.`;
    case "ASSIGNMENT_AGREED":
      return "Une date a été trouvée pour votre match attribué : il est maintenant planifié.";
    case "ASSIGNMENT_ESCALATED":
      return "Un match attribué n'a pas trouvé de date à temps — signalé aux admins.";
    default:
      return "Notification.";
  }
}
