import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="space-y-3">
        <h1 className="text-5xl font-extrabold tracking-tight">
          GER <span className="text-primary">Esport</span> Manager
        </h1>
        <p className="max-w-md text-muted-foreground">
          Gérez vos équipes, planifiez vos matchs, lancez le mapban en direct et
          suivez le classement.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/register">Créer une équipe</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Se connecter</Link>
        </Button>
      </div>
    </main>
  );
}
