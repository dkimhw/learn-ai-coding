import { cn } from "~/lib/utils";

// ─── Units toggle ───
// "3 of 12" and "25%" are the same fact, and which one is readable depends
// entirely on the sample. Small samples want counts, because a percentage of
// twelve invites more confidence than twelve people can support; large ones
// want rates.
//
// The choice belongs to a section, not the page. It started page-wide, on the
// reasoning that comparing a percentage in one chart against a count in another
// compares nothing — but a control in the page header rewrites sections two
// screens below it, which reads as a control that does nothing at all. Sections
// that are read against each other (a chart and the table restating it) share
// one toggle; sections answering different questions do not.
//
// Client-side state either way, and deliberately not persisted.

export type Units = "counts" | "percentages";

const OPTIONS: { value: Units; label: string }[] = [
  { value: "counts", label: "Counts" },
  { value: "percentages", label: "Percentages" },
];

export function UnitsToggle({
  value,
  onChange,
  className,
}: {
  value: Units;
  onChange: (units: Units) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Show figures as"
      className={cn(
        "inline-flex items-center rounded-lg border bg-muted/50 p-1",
        className
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            value === option.value
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A student count rendered in the instructor's chosen units.
 *
 * `total` is the sample the figure is a share of. With nobody in the sample
 * there is no rate to state — an em dash, not 0%, which would claim everybody
 * failed.
 */
export function formatStudents({
  value,
  total,
  units,
}: {
  value: number;
  total: number;
  units: Units;
}) {
  if (units === "counts") return String(value);
  if (total === 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
}
