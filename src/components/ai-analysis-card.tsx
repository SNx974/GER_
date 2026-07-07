import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AiShape = {
  provider?: string;
  summary?: string;
  anomalies?: string[];
  flagged?: boolean;
};

export function AiAnalysisCard({
  ai,
  flagged,
}: {
  ai: AiShape | null;
  flagged: boolean;
}) {
  return (
    <Card className={flagged ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Analyse IA
          {flagged ? (
            <Badge variant="destructive">Anomalies détectées</Badge>
          ) : (
            <Badge variant="success">RAS</Badge>
          )}
        </CardTitle>
        {ai?.provider && (
          <CardDescription>Moteur : {ai.provider}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{ai?.summary ?? "Analyse indisponible."}</p>
        {ai?.anomalies && ai.anomalies.length > 0 && (
          <ul className="list-inside list-disc text-muted-foreground">
            {ai.anomalies.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
