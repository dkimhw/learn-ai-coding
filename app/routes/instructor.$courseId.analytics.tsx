import { useState } from "react";
import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { getCourseById } from "~/services/courseService";
import { getUserById } from "~/services/userService";
import {
  analyzeDiscussion,
  findWorstDropOff,
  getCourseRevenueSummary,
  getDropOffSample,
  getLessonDropOff,
  getProgressDistribution,
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
  DiscussionSignal,
  DropOffSample,
  LessonDropOff,
  WorstDropOff,
} from "~/services/analyticsService";
import { getCurrentUserId } from "~/lib/session";
import { UserRole } from "~/db/schema";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { AnalyticsKpiTiles } from "~/components/analytics-kpi-tiles";
import { Callout, EmptyState } from "~/components/analytics-notices";
import { CourseScopePicker } from "~/components/course-scope-picker";
import { LessonDropOffChart } from "~/components/lesson-drop-off-chart";
import { ProgressDistributionSection } from "~/components/progress-distribution-section";
import { AnalyticsSectionHeader } from "~/components/analytics-section-header";
import { formatStudents } from "~/components/units-toggle";
import type { Units } from "~/components/units-toggle";
import { cn } from "~/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CircleCheck,
  Hourglass,
  TrendingDown,
} from "lucide-react";

export function meta({ data: loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course Analytics";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Course analytics for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view course analytics.", {
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

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only view analytics for your own courses.", {
      status: 403,
    });
  }

  // The headline completion figure is read off the distribution's 100% band, so
  // the tile and the chart below it cannot disagree.
  const progress = getProgressDistribution(courseId);
  const completion = summarizeCompletion(progress);
  const revenue = getCourseRevenueSummary(courseId);
  const dropOff = getLessonDropOff(courseId);
  const sample = getDropOffSample(courseId);
  // Derived from the curve we already read rather than a second query — the
  // narrow `getWorstDropOff` exists for callers that want only this.
  const worst = findWorstDropOff(dropOff);
  const discussion = analyzeDiscussion(dropOff);

  return {
    course,
    // Only to populate the scope picker — this page's own authorization was
    // settled above, and the list is the viewer's own, never this course's
    // instructor's.
    courses: listAnalyticsCourses({ userId: currentUserId, role: user.role }),
    completion,
    progress,
    revenue,
    dropOff,
    sample,
    worst,
    discussion,
  };
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export default function CourseAnalytics({ loaderData }: Route.ComponentProps) {
  const {
    course,
    courses,
    completion,
    progress,
    revenue,
    dropOff,
    sample,
    worst,
    discussion,
  } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/instructor/${course.id}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to Course Editor
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Course Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            How {course.title} is landing with your students
          </p>
        </div>
        <CourseScopePicker courses={courses} courseId={course.id} />
      </div>

      <AnalyticsKpiTiles
        completion={completion}
        revenue={revenue}
        scope="course"
      />

      <LessonDropOffSection
        courseId={course.id}
        courseSlug={course.slug}
        dropOff={dropOff}
        enrolled={completion.enrolled}
        sample={sample}
        worst={worst}
        discussion={discussion}
      />

      <ProgressDistributionSection distribution={progress} scope="course" />
    </div>
  );
}

/**
 * The centrepiece: where the course loses people.
 *
 * The two empty states are deliberately different messages. "No lessons" is
 * something the instructor can fix right now; "no students" is something they
 * have to wait for. Showing an empty chart for either would read as broken.
 */
function LessonDropOffSection({
  courseId,
  courseSlug,
  dropOff,
  enrolled,
  sample,
  worst,
  discussion,
}: {
  courseId: number;
  courseSlug: string;
  dropOff: LessonDropOff[];
  enrolled: number;
  sample: DropOffSample;
  worst: WorstDropOff | null;
  discussion: DiscussionSignal;
}) {
  // This section's own units: the chart and the table beneath it are one
  // reading, so they move together and nothing else on the page does.
  const [units, setUnits] = useState<Units>("counts");

  return (
    <section className="mt-10">
      <AnalyticsSectionHeader
        title="Lesson drop-off"
        description="Every lesson in the order students meet it. Where the curve falls is where the course is losing people."
        units={units}
        onUnitsChange={setUnits}
      />

      <Card>
        <CardContent className="p-6">
          {dropOff.length === 0 ? (
            <EmptyState
              title="This course has no lessons yet"
              body="Add modules and lessons in the course editor, and drop-off will appear here once students start working through them."
              action={
                <Link to={`/instructor/${courseId}`}>
                  <Button variant="outline">Open course editor</Button>
                </Link>
              }
            />
          ) : enrolled === 0 ? (
            <EmptyState
              title="No students enrolled yet"
              body="There is nothing to measure until someone works through the course. This chart fills in as students arrive."
            />
          ) : sample.mature === 0 ? (
            <EmptyState
              title="Still gathering data"
              body={`All ${enrolled} of your students enrolled within the last month, so none of them have had time to work through the course yet. Counting them now would show a course that falls apart at the end when really they simply have not arrived there. Drop-off appears once a month's intake is ${MATURITY_WINDOW_DAYS} days behind it.`}
            />
          ) : (
            <>
              <DropOffVerdict worst={worst} courseId={courseId} />
              <LessonDropOffChart
                dropOff={dropOff}
                courseId={courseId}
                units={units}
                sampleSize={sample.mature}
                worst={worst}
              />
              <SampleNote sample={sample} />
              <LessonDropOffTable
                dropOff={dropOff}
                courseId={courseId}
                courseSlug={courseSlug}
                units={units}
                sample={sample}
                worst={worst}
                discussion={discussion}
              />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The page's one interpretive claim, and the only place it is allowed to make
 * one.
 *
 * Above the threshold it states the finding outright, because an instructor
 * should not have to eyeball a twenty-point curve to find the cliff. Below it
 * the claim is replaced — not softened — by a message that names what the
 * threshold is, so the silence reads as patience rather than breakage. A page
 * that is confidently wrong loses an instructor's trust permanently; one that is
 * visibly waiting does not.
 */
function DropOffVerdict({
  worst,
  courseId,
}: {
  worst: WorstDropOff | null;
  courseId: number;
}) {
  if (!worst) {
    return (
      <Callout icon={CircleCheck}>
        <p className="font-medium">No lesson is losing students yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every lesson so far is reached by as many students as the one before
          it. Nothing here needs rewriting.
        </p>
      </Callout>
    );
  }

  if (!worst.meetsThreshold) {
    return (
      <Callout icon={Hourglass}>
        <p className="font-medium">Not enough students yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The biggest fall so far is at lesson {worst.order},{" "}
          <Link
            to={`/instructor/${courseId}/lessons/${worst.lessonId}`}
            className="underline underline-offset-2"
          >
            {worst.title}
          </Link>
          , but only {worst.reached}{" "}
          {pluralize(worst.reached, "student has", "students have")} reached it.
          We wait for {VERDICT_MIN_STUDENTS} before calling a lesson a problem,
          so you are not sent rewriting a good lesson because a couple of people
          got busy. The chart below is complete either way.
        </p>
      </Callout>
    );
  }

  return (
    <Callout icon={TrendingDown} emphasis="attention">
      <p className="font-medium">
        {worst.percentage}% of students stop at lesson {worst.order}
      </p>
      <p className="mt-1 text-sm">
        Of the {worst.reached} students who reached{" "}
        <Link
          to={`/instructor/${courseId}/lessons/${worst.lessonId}`}
          className="underline underline-offset-2"
        >
          {worst.title}
        </Link>
        , {worst.dropped} never went on to open {worst.nextTitle}. That is the
        largest fall anywhere in the course.
      </p>
    </Callout>
  );
}

/**
 * What the curve is computed from, next to the curve itself. The maturity
 * adjustment has to be visible rather than a hidden hand on the data — an
 * instructor who cannot see who was left out cannot judge how much to trust
 * what is left in.
 */
function SampleNote({ sample }: { sample: DropOffSample }) {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Based on {sample.mature} {pluralize(sample.mature, "student", "students")}{" "}
      whose first month is behind them.
      {sample.excludedAsRecent > 0 ? (
        <>
          {" "}
          {sample.excludedAsRecent} more{" "}
          {pluralize(sample.excludedAsRecent, "student is", "students are")} left
          out for now: they enrolled within the last {MATURITY_WINDOW_DAYS} days
          and have not had time to reach the later lessons, so counting them
          would read as drop-off that has not happened.
        </>
      ) : null}
    </p>
  );
}

/**
 * The same numbers as the chart, readable without colour or a pointing device,
 * and the unambiguous route from a problem lesson to its editor.
 */
function LessonDropOffTable({
  dropOff,
  courseId,
  courseSlug,
  units,
  sample,
  worst,
  discussion,
}: {
  dropOff: LessonDropOff[];
  courseId: number;
  courseSlug: string;
  units: Units;
  sample: DropOffSample;
  worst: WorstDropOff | null;
  discussion: DiscussionSignal;
}) {
  const total = sample.mature;
  const markedLessonId = worst?.meetsThreshold ? worst.lessonId : null;
  const flagged = new Set(discussion.flaggedLessonIds);

  // A course nobody has commented on gets no column at all. A column of dashes
  // the length of the table is noise, and this one is an annotation on the
  // lessons rather than a fact the table owes the reader.
  const showDiscussion = discussion.hasComments;

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left text-sm text-muted-foreground">
          {total} {pluralize(total, "student", "students")}
          {units === "percentages" ? ", shown as a share of that group" : ""}
        </caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">#</th>
            <th className="py-2 pr-4 font-medium">Lesson</th>
            <th className="py-2 pr-4 text-right font-medium">Reached</th>
            <th className="py-2 pr-4 text-right font-medium">
              Marked complete
              <span className="ml-1 font-normal">(self-reported)</span>
            </th>
            {showDiscussion ? (
              <th className="py-2 text-right font-medium">
                Discussion
                <span className="ml-1 font-normal">
                  (comments per student reached)
                </span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {dropOff.map((lesson, index) => (
            <tr
              key={lesson.lessonId}
              className={cn(
                "border-b last:border-0",
                lesson.lessonId === markedLessonId &&
                  "bg-amber-50 dark:bg-amber-950/40"
              )}
            >
              <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                {index + 1}
              </td>
              <td className="py-2 pr-4">
                <Link
                  to={`/instructor/${courseId}/lessons/${lesson.lessonId}`}
                  className="hover:underline"
                >
                  {lesson.title}
                </Link>
                {lesson.lessonId === markedLessonId ? (
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                    biggest fall
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatStudents({ value: lesson.reached, total, units })}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatStudents({ value: lesson.completed, total, units })}
              </td>
              {showDiscussion ? (
                <DiscussionCell
                  lesson={lesson}
                  courseSlug={courseSlug}
                  flagged={flagged.has(lesson.lessonId)}
                />
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A lesson's discussion, sitting beside its drop-off so the instructor can see
 * whether a lesson people abandon is also one they were asking about.
 *
 * A flagged lesson links into the discussion itself, because unlike a drop-off
 * number this signal comes with the text of what confused people — the count is
 * only the pointer.
 */
function DiscussionCell({
  lesson,
  courseSlug,
  flagged,
}: {
  lesson: LessonDropOff;
  courseSlug: string;
  flagged: boolean;
}) {
  return (
    <td className="py-2 text-right">
      {lesson.comments === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <>
          <Link
            to={`/courses/${courseSlug}/lessons/${lesson.lessonId}#discussion`}
            className="tabular-nums hover:underline"
          >
            {lesson.comments}
          </Link>
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">
            ({lesson.discussionRate?.toFixed(2)} each)
          </span>
          {flagged ? (
            <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
              asking a lot here
            </span>
          ) : null}
        </>
      )}
    </td>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <Skeleton className="mb-6 h-4 w-64" />
      <Skeleton className="mb-8 h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
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
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message =
        "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
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
