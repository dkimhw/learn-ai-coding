import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { AnalyticsSectionHeader } from "~/components/analytics-section-header";
import { Callout, EmptyState } from "~/components/analytics-notices";
import { ProgressDistributionChart } from "~/components/progress-distribution-chart";
import type { Units } from "~/components/units-toggle";
import type { ProgressDistribution } from "~/services/analyticsService";

// ─── Progress distribution section ───
// Shared by both analytics scopes. The distribution is the one chart that pools
// honestly across courses: each band is a proportion of that student's own
// course, so a four-lesson course and a forty-lesson one are already
// comparable and neither distorts the other.

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

/**
 * How far students actually get, as a shape rather than an average.
 *
 * The 0% band is pulled out above the bars rather than left as the first one,
 * because it is a different kind of finding: students who enrolled and never
 * opened a lesson are an onboarding problem, and rewriting lesson content will
 * not move them.
 */
export function ProgressDistributionSection({
  distribution,
  scope,
}: {
  distribution: ProgressDistribution;
  /** Wording only: the pooled view has to say what it spans. */
  scope: "course" | "all-courses";
}) {
  // This section's own units. Not persisted, and deliberately not shared with
  // the drop-off section: bands and drop-off answer different questions and are
  // never read against each other.
  const [units, setUnits] = useState<Units>("counts");

  const { totalStudents, neverStarted, completed } = distribution;
  const isPooled = scope === "all-courses";
  const subject = isPooled ? "your courses" : "the course";

  return (
    <section className="mt-10">
      <AnalyticsSectionHeader
        title="How far students get"
        description={`Every enrolled student, grouped by how much of ${subject} they have finished. One average would hide whether people stall at the start or near the end.`}
        units={units}
        onUnitsChange={setUnits}
      />

      <Card>
        <CardContent className="p-6">
          {totalStudents === 0 ? (
            <EmptyState
              title="No students enrolled yet"
              body={`Once students arrive, this shows how far through ${subject} they have got.`}
            />
          ) : (
            <>
              {neverStarted > 0 ? (
                <Callout icon={DoorOpen}>
                  <p className="font-medium">
                    {neverStarted} of {totalStudents}{" "}
                    {pluralize(neverStarted, "student has", "students have")} not
                    completed a single lesson
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    They enrolled and have marked nothing complete, which usually
                    means they never got going. That is an onboarding problem
                    rather than a content one — no amount of rewriting a lesson
                    reaches someone who never opened it.
                  </p>
                </Callout>
              ) : null}

              <ProgressDistributionChart
                distribution={distribution}
                units={units}
              />

              <p className="mt-4 text-sm text-muted-foreground">
                Based on all {totalStudents}{" "}
                {isPooled
                  ? pluralize(totalStudents, "enrollment", "enrollments")
                  : `${pluralize(totalStudents, "student", "students")} enrolled`}
                , however recently they arrived. {completed}{" "}
                {pluralize(completed, "has", "have")} completed every lesson —
                the same figure as the completion rate above.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
