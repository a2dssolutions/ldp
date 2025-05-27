import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export function AiSuggestionsPlaceholder() {
  return (
    <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20 shadow-lg">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <Rocket className="w-6 h-6 text-primary" />
        <CardTitle className="text-lg font-semibold text-primary">Advanced Insights</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Coming Soon: Deeper AI-powered suggestions and market trend predictions to supercharge your strategy!
        </p>
      </CardContent>
    </Card>
  );
}
