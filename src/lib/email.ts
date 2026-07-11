/**
 * Envoi d'emails transactionnels via Brevo (ex-Sendinblue).
 *
 * Sans BREVO_API_KEY configurée, les envois sont silencieusement ignorés
 * (juste loggés) — n'empêche jamais le flux applicatif principal (créer un
 * compte, une proposition, un match...) de fonctionner sans email configuré.
 */

type SendEmailInput = {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
};

async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email] BREVO_API_KEY absente — email non envoyé : "${input.subject}"`);
    return;
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    console.error("[email] BREVO_SENDER_EMAIL absente — email non envoyé.");
    return;
  }
  const senderName = process.env.BREVO_SENDER_NAME ?? "GER Esport Manager";

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: input.to,
        subject: input.subject,
        htmlContent: input.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Brevo ${res.status} — ${body.slice(0, 300)}`);
    }
  } catch (e) {
    // Un échec d'envoi ne doit jamais faire échouer l'action appelante.
    console.error("[email] erreur d'envoi :", e);
  }
}

const APP_URL = () => process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="color: #e11d48;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top: 32px; font-size: 12px; color: #666;">
        GER Esport Manager — <a href="${APP_URL()}">${APP_URL()}</a>
      </p>
    </div>
  `;
}

function fmtDate(date: Date): string {
  return date.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
}

// ─── 1. Proposition de match envoyée ───

export async function sendProposalReceivedEmail(params: {
  to: { email: string; name?: string };
  opponentTeamName: string;
  proposedDate: Date;
  format: string;
}): Promise<void> {
  await sendEmail({
    to: [params.to],
    subject: `Nouvelle proposition de match — ${params.opponentTeamName}`,
    html: layout(
      "Nouvelle proposition de match",
      `<p>L'équipe <strong>${params.opponentTeamName}</strong> vous propose un match :</p>
       <ul>
         <li><strong>Date :</strong> ${fmtDate(params.proposedDate)}</li>
         <li><strong>Format :</strong> ${params.format}</li>
       </ul>
       <p><a href="${APP_URL()}/planning">Répondre à la proposition</a></p>`
    ),
  });
}

// ─── 2. Match confirmé (proposition acceptée) ───

export async function sendMatchConfirmedEmail(params: {
  to: { email: string; name?: string }[];
  teamAName: string;
  teamBName: string;
  scheduledAt: Date;
  format: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Match confirmé — ${params.teamAName} vs ${params.teamBName}`,
    html: layout(
      "Match confirmé",
      `<p>Votre match est confirmé :</p>
       <ul>
         <li><strong>${params.teamAName}</strong> vs <strong>${params.teamBName}</strong></li>
         <li><strong>Date :</strong> ${fmtDate(params.scheduledAt)}</li>
         <li><strong>Format :</strong> ${params.format}</li>
       </ul>
       <p><a href="${APP_URL()}/matches">Voir mes matchs</a></p>`
    ),
  });
}

// ─── 3. Rappel 30 minutes avant le match ───

export async function sendMatchReminderEmail(params: {
  to: { email: string; name?: string }[];
  teamAName: string;
  teamBName: string;
  scheduledAt: Date;
  roomToken: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Votre match commence dans 30 minutes — ${params.teamAName} vs ${params.teamBName}`,
    html: layout(
      "Votre match commence bientôt",
      `<p>Votre match <strong>${params.teamAName}</strong> vs <strong>${params.teamBName}</strong>
       commence à <strong>${fmtDate(params.scheduledAt)}</strong> (dans environ 30 minutes).</p>
       <p><a href="${APP_URL()}/match/${params.roomToken}">Rejoindre la salle de match</a></p>`
    ),
  });
}

// ─── 4. Réinitialisation de mot de passe ───

export async function sendPasswordResetEmail(params: {
  to: { email: string; name?: string };
  resetUrl: string;
}): Promise<void> {
  await sendEmail({
    to: [params.to],
    subject: "Réinitialisation de votre mot de passe",
    html: layout(
      "Réinitialisation de mot de passe",
      `<p>Une demande de réinitialisation de mot de passe a été effectuée pour
       votre compte.</p>
       <p><a href="${params.resetUrl}">Choisir un nouveau mot de passe</a></p>
       <p style="font-size: 13px; color: #666;">
         Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette
         demande, vous pouvez ignorer cet email.
       </p>`
    ),
  });
}

// ─── 5. Inscription / bienvenue ───

export async function sendRegistrationWelcomeEmail(params: {
  to: { email: string; name?: string };
  captainName: string;
  teamName: string;
}): Promise<void> {
  await sendEmail({
    to: [params.to],
    subject: `Bienvenue sur GER Esport Manager, ${params.teamName} !`,
    html: layout(
      "Compte créé avec succès",
      `<p>Bonjour ${params.captainName},</p>
       <p>Votre compte capitaine et votre équipe <strong>${params.teamName}</strong>
       ont bien été créés sur GER Esport Manager.</p>
       <p>Vous pouvez dès à présent ajouter vos joueurs et proposer des matchs.</p>
       <p><a href="${APP_URL()}/dashboard">Accéder à mon espace</a></p>`
    ),
  });
}
