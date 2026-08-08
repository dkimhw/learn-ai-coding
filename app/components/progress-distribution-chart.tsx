import { cn } from "~/lib/utils";
import { formatStudents } from "~/components/units-toggle";
import type { Units } from "~/components/units-toggle";
import type { ProgressDistribution } from "~/services/analyticsService";

// ─── Progress distribution ───
// Where every enrolled student has got to, as six ordered bands rather than one
// average. A course whose students cluster at 5% has a different disease from
// one whose students cluster at 90%, and a single completion percentage cannot
// tell those apart.
//
// Plain bars rather than a charting library: six ordered categories with a
// direct label on each is a form the browser draws well on its own, and doing it
// this way keeps the section rendering on the server instead of waiting for a
// container measurement.
//
// One hue for every band. Length already carries the magnitude, and colouring
// the bands would imply a judgement about them that this chart does not make —
// the 0% finding is stated in words above, where it can be qualified.
const BAND_FILL =
  "[--band-fill:#2a78d6] dark:[--band-fill:#3987e5]";

/** Bars are scaled against the largest band, so the shape stays readable. */
function widthPercent(students: number, largestBand: number) {
  if (largestBand === 0) return 0;
  return (students / largestBand) * 100;
}

export function ProgressDistributionChart({
  distribution,
  units,
}: {
  distribution: ProgressDistribution;
  units: Units;
}) {
  const largestBand = Math.max(
    ...distribution.bands.map((band) => band.students)
  );

  return (
    <div className={cn("space-y-2", BAND_FILL)}>
      {distribution.bands.map((band) => (
        <div
          key={band.key}
          className="grid grid-cols-[4rem_1fr_5rem] items-center gap-3"
        >
          <span className="text-right text-sm tabular-nums text-muted-foreground">
            {band.label}
          </span>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-3 rounded-full bg-[var(--band-fill)]"
              style={{
                width: `${widthPercent(band.students, largestBand)}%`,
              }}
            />
          </div>
          <span className="text-sm tabular-nums">
            {formatStudents({
              value: band.students,
              total: distribution.totalStudents,
              units,
            })}
            {/* The raw count never leaves, whatever the toggle says: a band
                that is two students must not be readable as two hundred. */}
            {units === "percentages" ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({band.students})
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
