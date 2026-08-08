import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";

// ─── Stat tile ───
// A single labelled figure. Label in sentence case above, value below, an
// optional line of context under that.
//
// The value is deliberately not tabular-nums: these are large standalone
// numbers, and forcing every digit to the width of a "0" makes them look loose
// at display sizes. Tabular figures belong in columns that must align.

export function StatTile({
  label,
  value,
  context,
  icon: Icon,
  emphasis = "default",
  className,
}: {
  label: string;
  value: string | number;
  context?: string;
  icon?: LucideIcon;
  /**
   * "attention" marks a figure that implies an action rather than one that is
   * merely large. It reads as a warning, so it is paired with the icon and the
   * context line — never colour alone.
   */
  emphasis?: "default" | "attention";
  className?: string;
}) {
  const isAttention = emphasis === "attention";

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div
          className={cn(
            "flex items-center gap-1.5 text-sm text-muted-foreground",
            isAttention && "text-amber-700 dark:text-amber-400"
          )}
        >
          {Icon ? <Icon className="size-4 shrink-0" /> : null}
          {label}
        </div>
        <p
          className={cn(
            "mt-2 text-3xl font-semibold",
            isAttention && "text-amber-700 dark:text-amber-400"
          )}
        >
          {value}
        </p>
        {context ? (
          <p
            className={cn(
              "mt-1 text-sm text-muted-foreground",
              isAttention && "text-amber-700 dark:text-amber-400"
            )}
          >
            {context}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
