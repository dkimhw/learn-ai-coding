import { useState } from "react";
import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import {
  getCourseOverviewRows,
  getPooledDropOffSample,
  getPooledProgressDistribution,
  getPooledRevenueSummary,
  listAnalyticsCourses,
  summarizeCompletion,
} from "~/services/analyticsService";
// From `~/lib/analytics`, not the service: a value imported from the service
// here would pull `~/db` into the browser bundle and break client navigation.
import {
  MATURITY_WINDOW_DAYS,
  VERDICT_MIN_STUDENTS,
} from "~/lib/analytics";
import type {
  CourseOverviewRow,
  DropOffSample,
} from "~/services/analyticsService";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { AnalyticsKpiTiles } from "~/components/analytics-kpi-tiles";
import { EmptyState } from "~/components/analytics-notices";
import { CourseScopePicker } from "~/components/course-scope-picker";
import { ProgressDistributionSection } from "~/components/progress-distribution-section";
import { AnalyticsSectionHeader } from "~/components/analytics-section-header";
import { formatStudents } from "~/components/units-toggle";
import type { Units } from "~/components/units-toggle";
import { cn } from "~/lib/utils";
import { AlertTriangle, GraduationCap, Plus } from "lucide-react";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    {
      name: "description",
      content: "How your courses are landing with your students",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  // The one authorization decision this page makes. Everything below is
  // computed from this list, so a course the viewer may not see cannot reach
  // the page through a tile, a row, or the picker.
  const courses = listAnalyticsCourses({
    userId: currentUserId,
    role: user.role,
  });
  const courseIds = courses.map((course) => course.id);

  // The headline completion figure is read off the pooled 100% band rather than
  // averaged across per-course rates, so a course with three students cannot
  // swing the number as hard as one with sixty.
  const progress = getPooledProgressDistribution(courseIds);

  return {
    courses,
    completion: summarizeCompletion(progress),
    progress,
    revenue: getPooledRevenueSummary(courseIds),
    sample: getPooledDropOffSample(courseIds),
    rows: getCourseOverviewRows(courses),
  };
}

export default function AllCoursesAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { courses, completion, progress, revenue, sample, rows } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            How your teaching is landing, across every course at once
          </p>
        </div>
        {courses.length > 0 ? (
          <CourseScopePicker courses={courses} courseId={null} />
        ) : null}
      </div>

      {courses.length === 0 ? (
        <NoCoursesYet />
      ) : (
        <>
          <AnalyticsKpiTiles
            completion={completion}
            revenue={revenue}
            scope="all-courses"
          />

          <CourseDropOffSection rows={rows} sample={sample} />

          <ProgressDistributionSection
            distribution={progress}
            scope="all-courses"
          />
        </>
      )}
    </div>
  );
}

/**
 * An instructor with no courses gets told to write one, not shown a page of
 * zeroes. Zeroed tiles claim a course landed badly; there is no course.
 */
function NoCoursesYet() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="py-10 text-center">
          <GraduationCap className="mx-auto mb-4 size-12 text-muted-foreground/50" />
          <p className="font-medium">No courses to analyse yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Analytics describe how students move through your material, so there
            is nothing to show until you have published something for them to
            move through.
          </p>
          <div className="mt-4">
            <Link to="/instructor/new">
              <Button>
                <Plus className="mr-2 size-4" />
                Create your first course
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What the pooled view shows instead of a drop-off curve.
 *
 * Drop-off is the one thing that does not pool: "lesson 7" means a different
 * thing in every course, so a curve laid across several of them would be an
 * artefact of how they happen to line up rather than a finding. One row per
 * course keeps every claim inside the course that supports it, and each row
 * carries its own verdict threshold — a course with sixty students can name its
 * cliff while its three-student neighbour says it is still gathering data.
 */
function CourseDropOffSection({
  rows,
  sample,
}: {
  rows: CourseOverviewRow[];
  sample: DropOffSample;
}) {
  // This section's own units, applying to the worst-drop-off column.
  const [units, setUnits] = useState<Units>("counts");

  const totalStudents = rows.reduce((total, row) => total + row.students, 0);

  return (
    <section className="mt-10">
      <AnalyticsSectionHeader
        title="Where each course loses people"
        description="One row per course. Drop-off is not pooled across courses — lesson 7 of one course has nothing to do with lesson 7 of another — so each course names its own worst fall, and you open a course to see its curve."
        units={units}
        onUnitsChange={setUnits}
      />

      <Card>
        <CardContent className="p-6">
          {totalStudents === 0 ? (
            <EmptyState
              title="No students enrolled yet"
              body="There is nothing to measure until someone works through a course. These rows fill in as students arrive."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Course</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Students
                      </th>
                      <th className="py-2 font-medium">Worst drop-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <CourseRow key={row.id} row={row} units={units} />
                    ))}
                  </tbody>
                </table>
              </div>
              <PooledSampleNote sample={sample} />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function CourseRow({ row, units }: { row: CourseOverviewRow; units: Units }) {
  const worst = row.worstDropOff;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        <Link
          to={`/instructor/${row.id}/analytics`}
          className="font-medium hover:underline"
        >
          {row.title}
        </Link>
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{row.students}</td>
      <td className={cn("py-2", worst?.meetsThreshold && "text-amber-700 dark:text-amber-400")}>
        {row.students === 0 ? (
          <span className="text-muted-foreground">No students yet</span>
        ) : !worst ? (
          <span className="text-muted-foreground">
            No lesson is losing students yet
          </span>
        ) : !worst.meetsThreshold ? (
          <span className="text-muted-foreground">
            Not enough students yet — {worst.reached} of {VERDICT_MIN_STUDENTS}{" "}
            reached lesson {worst.order}
          </span>
        ) : (
          <>
            {formatStudents({
              value: worst.dropped,
              total: worst.reached,
              units,
            })}
            {units === "counts" ? ` of ${worst.reached}` : ""} stop at lesson{" "}
            {worst.order}: {worst.title}
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * The maturity adjustment, summed across courses. The filter still applies per
 * course — a student can be mature on one and a newcomer on another — but the
 * exclusion has to stay as visible here as it is on a single course's page.
 */
function PooledSampleNote({ sample }: { sample: DropOffSample }) {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      Drop-off is based on {sample.mature}{" "}
      {sample.mature === 1 ? "enrollment" : "enrollments"} whose first month is
      behind them.
      {sample.excludedAsRecent > 0 ? (
        <>
          {" "}
          {sample.excludedAsRecent} more{" "}
          {sample.excludedAsRecent === 1 ? "is" : "are"} left out for now: they
          started within the last {MATURITY_WINDOW_DAYS} days and have not had
          time to reach the later lessons, so counting them would read as
          drop-off that has not happened.
        </>
      ) : null}
    </p>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <Skeleton className="mb-6 h-4 w-48" />
      <Skeleton className="mb-8 h-9 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading your analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to view these analytics.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
