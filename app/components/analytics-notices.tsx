import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

// ─── Analytics notices ───
// The two ways the analytics pages talk rather than plot: a callout that states
// a finding, and an empty state that says what is missing and why. Shared by
// the per-course and all-courses scopes so the same silence reads the same way
// in both — an instructor who sees one wording on one page and another wording
// on the other has to work out which page is lying.

/**
 * A stated finding, sitting above the chart it came from.
 *
 * `attention` is reserved for a figure that implies an action — a lesson to
 * rewrite, a team admin to chase. Using it for anything else spends the one
 * colour the page has to say "look here".
 */
export function Callout({
  icon: Icon,
  emphasis = "default",
  children,
}: {
  icon: LucideIcon;
  emphasis?: "default" | "attention";
  children: React.ReactNode;
}) {
  const isAttention = emphasis === "attention";

  return (
    <div
      className={cn(
        "mb-6 flex gap-3 rounded-lg border p-4",
        isAttention &&
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/**
 * What a section shows when it has nothing to show.
 *
 * Always a sentence about why, never a blank panel: a new course's analytics
 * are empty for good reasons the instructor cannot otherwise see, and an empty
 * panel reads as a bug.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
