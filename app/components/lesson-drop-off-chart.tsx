import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { Skeleton } from "~/components/ui/skeleton";
import type { Units } from "~/components/units-toggle";
import type { LessonDropOff, WorstDropOff } from "~/services/analyticsService";

// ─── Lesson drop-off chart ───
// Two series over the lessons of a course in the order students meet them:
// how many ever reached each lesson, and how many marked it complete.
//
// They are plotted separately on purpose. A lesson few students *reach* means
// the material before it is losing people and the fix is upstream; a lesson
// many reach but few *finish* means that lesson is the problem and the fix is
// local. One combined series would erase the distinction.
//
// Colours are set as custom properties on the wrapper rather than read from the
// shadcn --chart-* tokens: this pair is validated for colour-vision deficiency
// against both surfaces (worst-pair ΔE 24.7 light / 26.8 dark), and the shared
// tokens are not. Marks carry the colour; all text stays on text tokens.
const SERIES_COLORS =
  "[--series-reached:#2a78d6] [--series-completed:#eb6834] " +
  "dark:[--series-reached:#3987e5] dark:[--series-completed:#d95926]";

/**
 * Past this many lessons the per-point dots crowd into a solid band, so they
 * drop out and the 2px line carries the shape on its own. The hover marker
 * stays, so any individual lesson is still readable.
 */
const DOTS_LEGIBLE_UP_TO = 20;

type DropOffPoint = {
  /** 1-based position along the whole course — the chart's x value. */
  order: number;
  lessonId: number;
  title: string;
  reached: number;
  completed: number;
};

export function LessonDropOffChart({
  dropOff,
  courseId,
  units,
  sampleSize,
  worst,
}: {
  dropOff: LessonDropOff[];
  courseId: number;
  units: Units;
  /** Mature students the curve is computed from — the percentage denominator. */
  sampleSize: number;
  /** Marked on the axis, so the cliff is findable without reading every bar. */
  worst: WorstDropOff | null;
}) {
  const navigate = useNavigate();

  // Recharts measures its container to lay the chart out, so it cannot render
  // on the server. Hold the skeleton until we are mounted rather than shipping
  // a zero-width chart that resizes on hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const asPercentages = units === "percentages";

  // Plotted values carry the chosen units so the axis, the tooltip and the
  // curve can never disagree about what is being shown.
  function toUnits(count: number) {
    if (!asPercentages) return count;
    return sampleSize === 0 ? 0 : Math.round((count / sampleSize) * 100);
  }

  const points: DropOffPoint[] = dropOff.map((lesson, index) => ({
    order: index + 1,
    lessonId: lesson.lessonId,
    title: lesson.title,
    reached: toUnits(lesson.reached),
    completed: toUnits(lesson.completed),
  }));

  const showDots = points.length <= DOTS_LEGIBLE_UP_TO;

  function goToLesson(index: number | undefined) {
    const point = typeof index === "number" ? points[index] : undefined;
    if (point) navigate(`/instructor/${courseId}/lessons/${point.lessonId}`);
  }

  function handleChartClick(state: MouseHandlerDataParam) {
    goToLesson(
      typeof state.activeTooltipIndex === "number"
        ? state.activeTooltipIndex
        : undefined
    );
  }

  return (
    <div className={SERIES_COLORS}>
      <LessonDropOffLegend />

      {mounted ? (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
              onClick={handleChartClick}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <XAxis
                dataKey="order"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={12}
                label={{
                  value: "Lesson, in course order",
                  position: "insideBottom",
                  offset: -16,
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                }}
              />
              <YAxis
                allowDecimals={false}
                width={48}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                // Percentages get the full scale: letting the axis end at the
                // largest value would make every course look equally leaky.
                domain={asPercentages ? [0, 100] : undefined}
                tickFormatter={(value: number) =>
                  asPercentages ? `${value}%` : String(value)
                }
              />
              {/* The verdict, marked where it happens. Withheld below the
                  threshold along with the claim it belongs to. */}
              {worst?.meetsThreshold ? (
                <ReferenceLine
                  x={worst.order}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: "Biggest fall",
                    position: "insideTopRight",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  }}
                />
              ) : null}
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  maxWidth: 280,
                }}
                labelStyle={{
                  color: "var(--popover-foreground)",
                  fontWeight: 600,
                  whiteSpace: "normal",
                }}
                itemStyle={{ color: "var(--popover-foreground)" }}
                // Lesson titles cannot fit as axis labels at twenty-plus
                // categories, so the tooltip is where the full title lives.
                labelFormatter={(label) =>
                  points[Number(label) - 1]?.title ?? `Lesson ${label}`
                }
                formatter={(value) =>
                  asPercentages ? `${value}%` : String(value)
                }
              />
              <Line
                type="monotone"
                dataKey="reached"
                name="Reached"
                stroke="var(--series-reached)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={
                  showDots
                    ? {
                        r: 4,
                        fill: "var(--series-reached)",
                        // 2px ring in the surface colour keeps the dot legible
                        // where the two series cross.
                        stroke: "var(--card)",
                        strokeWidth: 2,
                      }
                    : false
                }
                activeDot={{
                  r: 5,
                  fill: "var(--series-reached)",
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
              />
              <Line
                type="monotone"
                dataKey="completed"
                name="Marked complete"
                stroke="var(--series-completed)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={
                  showDots
                    ? {
                        r: 4,
                        fill: "var(--series-completed)",
                        stroke: "var(--card)",
                        strokeWidth: 2,
                      }
                    : false
                }
                activeDot={{
                  r: 5,
                  fill: "var(--series-completed)",
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Skeleton className="h-80 w-full" />
      )}

      <p className="mt-2 text-sm text-muted-foreground">
        Hover a point for the lesson title; click to open that lesson's editor.
      </p>
    </div>
  );
}

/**
 * Written by hand rather than using Recharts' `<Legend>` so the swatch carries
 * the series colour and the text stays on a text token, and so the
 * self-reported caveat rides the series it qualifies.
 */
function LessonDropOffLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-0.5 w-4 rounded-full bg-[var(--series-reached)]"
        />
        <span className="text-foreground">Reached the lesson</span>
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-0.5 w-4 rounded-full bg-[var(--series-completed)]"
        />
        <span className="text-foreground">Marked complete</span>
        <span className="text-muted-foreground">(self-reported)</span>
      </span>
    </div>
  );
}
