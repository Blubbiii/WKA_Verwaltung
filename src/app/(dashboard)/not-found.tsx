import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <FileQuestion className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-2xl font-semibold">Seite nicht gefunden</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Die angeforderte Seite existiert nicht oder wurde verschoben.
      </p>
      <Button asChild>
        <Link href="/dashboard">{`Zur\u00FCck zum Dashboard`}</Link>
      </Button>
    </div>
  );
}
