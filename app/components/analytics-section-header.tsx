import { UnitsToggle } from "~/components/units-toggle";
import type { Units } from "~/components/units-toggle";

// ─── Analytics section header ───
// A section's title, its one-line explanation, and the units control for the
// figures inside it.
//
// The control sits here rather than at the top of the page because a toggle in
// the page header silently rewrites sections two screens further down, which
// reads as a control that does nothing. Each section owning its own units means
// the thing you click and the numbers that change are in the same eyeful.

export function AnalyticsSectionHeader({
  title,
  description,
  units,
  onUnitsChange,
}: {
  title: string;
  description: string;
  /** Omit both units props for a section with nothing to re-express. */
  units?: Units;
  onUnitsChange?: (units: Units) => void;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      {/* min-w-0 so the description wraps rather than pushing the toggle onto a
          line of its own, where it stops reading as this section's control. */}
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>
      </div>
      {units && onUnitsChange ? (
        <UnitsToggle
          value={units}
          onChange={onUnitsChange}
          className="shrink-0"
        />
      ) : null}
    </div>
  );
}
