import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  lessonComments,
  LessonProgressStatus,
  lessonProgress,
  lessons,
  modules,
  purchases,
  UserRole,
} from "~/db/schema";
import { MATURITY_WINDOW_DAYS, VERDICT_MIN_STUDENTS } from "~/lib/analytics";

// ─── Analytics Service ───
// Per-course aggregate reads backing the instructor Course Analytics page.
// Routes call into here and render; they never build these queries themselves.
// Every read is computed live per request — no cache, no summary tables.

// Defined in `~/lib/analytics` and re-exported here so server callers have one
// import. Route *components* must import them from `~/lib/analytics` directly:
// reading them from this module pulls the database into the browser bundle.
export {
  MATURITY_WINDOW_DAYS,
  VERDICT_MIN_STUDENTS,
} from "~/lib/analytics";

/**
 * SQL predicate: this enrollment's cohort is old enough to enter drop-off.
 *
 * Cohorts are calendar months of *enrollment* — not purchase, because a student
 * who arrived by redeeming a team coupon never made a purchase of their own and
 * would otherwise vanish from the analysis. A cohort is admitted only once its
 * last possible member has had the full window, so the comparison is against the
 * first day of the following month rather than each student's own date. Everyone
 * enrolled in a given month therefore shares one fate, which is what makes the
 * exclusion explainable: "March is in, April is not yet."
 */
function isMatureCohort() {
  return sql`date(${enrollments.enrolledAt}, 'start of month', '+1 month') <= date('now', ${`-${MATURITY_WINDOW_DAYS} days`})`;
}

/**
 * Number of students enrolled in a course.
 *
 * This is the audience the rest of the analytics on the page describe, so it is
 * a plain enrollment count with no maturity filter applied — students who
 * enrolled yesterday are part of the audience even though they are excluded
 * from drop-off.
 */
export function getEnrolledStudentCount(courseId: number) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  return result?.count ?? 0;
}

/**
 * The six bands students are bucketed into by how much of a course they have
 * finished. Ordered, because the shape of the distribution is the finding — a
 * course whose students cluster at 5% has a different disease from one whose
 * students cluster at 90%, and one averaged number cannot tell them apart.
 */
export const PROGRESS_BANDS = [
  { key: "0", label: "0%" },
  { key: "1-25", label: "1–25%" },
  { key: "26-50", label: "26–50%" },
  { key: "51-75", label: "51–75%" },
  { key: "76-99", label: "76–99%" },
  { key: "100", label: "100%" },
] as const;

export type ProgressBandKey = (typeof PROGRESS_BANDS)[number]["key"];

export type ProgressBand = {
  key: ProgressBandKey;
  label: string;
  /** Raw student count. Always carried, so a band of two is never read as two hundred. */
  students: number;
};

/**
 * Which band a student falls in, from lessons completed out of the course total.
 *
 * The two edges are exact rather than rounded: 0% means no lesson completed at
 * all, and 100% means every one of them. A student on 249 of 250 lessons rounds
 * to 100% and has not finished the course, so the ratio — never a rounded
 * percentage — decides.
 */
export function progressBandFor(opts: {
  completedLessons: number;
  lessonCount: number;
}): ProgressBandKey {
  if (opts.completedLessons <= 0) return "0";
  if (opts.completedLessons >= opts.lessonCount) return "100";

  const ratio = opts.completedLessons / opts.lessonCount;
  if (ratio <= 0.25) return "1-25";
  if (ratio <= 0.5) return "26-50";
  if (ratio <= 0.75) return "51-75";
  return "76-99";
}

export type ProgressDistribution = {
  /** All six bands, in order, whether or not anyone is in them. */
  bands: ProgressBand[];
  /** Enrolled students the distribution describes. */
  totalStudents: number;
  /**
   * The 0% band, surfaced separately because it is its own finding: enrolled
   * and never started is an onboarding failure, not a content one.
   */
  neverStarted: number;
  /** The 100% band. The headline completion figure reads this and nothing else. */
  completed: number;
  /** Lessons in the course — with none there is nothing to be a proportion of. */
  lessonCount: number;
};

/**
 * How far every enrolled student has actually got, as a distribution rather
 * than an average.
 *
 * Unlike drop-off this is not maturity-filtered. Drop-off asks "did they give
 * up", which a student who enrolled last week cannot yet have done; this asks
 * "where is everybody", and a recent arrival sitting at 0% is a true answer to
 * that question.
 */
export function getProgressDistribution(
  courseId: number
): ProgressDistribution {
  const lessonCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .get()?.count ?? 0;

  // One row per enrolled student, carrying how many of this course's lessons
  // they have marked complete. Students with no progress at all still produce a
  // row, at zero — they are the 0% band, and dropping them would hide it.
  const perStudent = db
    .select({
      userId: enrollments.userId,
      completedLessons: sql<number>`count(distinct case when ${modules.id} is not null and ${lessonProgress.status} = ${LessonProgressStatus.Completed} then ${lessonProgress.lessonId} end)`,
    })
    .from(enrollments)
    .leftJoin(lessonProgress, eq(lessonProgress.userId, enrollments.userId))
    .leftJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    // The course condition rides the join, so progress a student has on some
    // other course cannot count towards this one.
    .leftJoin(
      modules,
      and(eq(modules.id, lessons.moduleId), eq(modules.courseId, courseId))
    )
    .where(eq(enrollments.courseId, courseId))
    .groupBy(enrollments.userId)
    .all();

  const counts = new Map<ProgressBandKey, number>();
  for (const student of perStudent) {
    const key = progressBandFor({
      completedLessons: student.completedLessons,
      lessonCount,
    });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const bands = PROGRESS_BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    students: counts.get(band.key) ?? 0,
  }));

  return {
    bands,
    totalStudents: perStudent.length,
    neverStarted: counts.get("0") ?? 0,
    completed: counts.get("100") ?? 0,
    lessonCount,
  };
}

export type CourseCompletionSummary = {
  enrolled: number;
  completed: number;
  /**
   * Completed as a percentage of enrolled, rounded, or null when there is
   * nobody to compute it from. A course with no students has no completion
   * rate — 0% would claim everyone failed, which is a different statement.
   */
  rate: number | null;
};

/**
 * The headline completion figure, read off the 100% band.
 *
 * Deriving it from the distribution rather than counting `completedAt` stamps is
 * what makes the tile and the chart below it agree by construction instead of by
 * coincidence. Both mean the same thing — every lesson in the course completed —
 * which is also the condition `syncEnrollmentCompletion` stamps on, so the
 * instructor roster and the student dashboard agree too.
 */
export function summarizeCompletion(
  distribution: ProgressDistribution
): CourseCompletionSummary {
  const enrolled = distribution.totalStudents;

  return {
    enrolled,
    completed: distribution.completed,
    rate:
      enrolled === 0
        ? null
        : Math.round((distribution.completed / enrolled) * 100),
  };
}

/** As {@link summarizeCompletion}, for callers that do not need the bands. */
export function getCompletionSummary(courseId: number): CourseCompletionSummary {
  return summarizeCompletion(getProgressDistribution(courseId));
}

export type CourseRevenueSummary = {
  /**
   * Sum of what students actually paid, in cents. Regional pricing discounts
   * are already reflected because `purchases.pricePaid` records the charged
   * amount, not the list price.
   *
   * This is *gross collected* and must never be labelled earnings or payout:
   * the data model has no fee, commission, or refund concept, so any label
   * implying take-home pay would be a number the instructor compares against
   * their bank account and finds wrong.
   */
  grossCollected: number;
  /**
   * Purchase records, not students. One team purchase carries several coupons,
   * so this is deliberately a different figure from the enrolled student count.
   */
  saleCount: number;
  /** Team coupons issued for this course. */
  seatsSold: number;
  /** Team coupons a student has actually redeemed. */
  seatsRedeemed: number;
};

/**
 * Revenue and team-seat totals for a course.
 *
 * Seats are counted from coupons rather than purchases because the gap between
 * sold and redeemed is the one revenue figure that implies an action: every
 * unredeemed seat is a person who was paid for and never showed up, and the
 * instructor can chase the team admin about it.
 */
export function getCourseRevenueSummary(courseId: number): CourseRevenueSummary {
  const revenue = db
    .select({
      // coalesce, because sum() over no rows is null rather than 0.
      grossCollected: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      saleCount: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();

  const seats = db
    .select({
      seatsSold: sql<number>`count(*)`,
      seatsRedeemed: sql<number>`count(${coupons.redeemedByUserId})`,
    })
    .from(coupons)
    .where(eq(coupons.courseId, courseId))
    .get();

  return {
    grossCollected: revenue?.grossCollected ?? 0,
    saleCount: revenue?.saleCount ?? 0,
    seatsSold: seats?.seatsSold ?? 0,
    seatsRedeemed: seats?.seatsRedeemed ?? 0,
  };
}

export type LessonReach = {
  lessonId: number;
  title: string;
  /** Module position, then lesson position — the order students meet lessons in. */
  modulePosition: number;
  lessonPosition: number;
  /**
   * Students who ever opened the lesson. A progress row in *any* state counts:
   * these rows are written passively when the lesson page loads, so reach
   * measures behaviour rather than diligence and cannot be forgotten.
   */
  reached: number;
  /**
   * Students who marked the lesson complete. Self-reported — it is only written
   * when a student clicks a button — so it is always displayed as such and
   * never drives a verdict.
   */
  completed: number;
};

export type LessonDropOff = LessonReach & {
  /** Comments left on the lesson by students in the drop-off sample. */
  comments: number;
  /**
   * Comments per student who reached the lesson, or null where nobody reached
   * it and there is no denominator.
   *
   * Normalizing by reach is essential rather than cosmetic: raw comment counts
   * are mechanically confounded with traffic, so comparing them would simply
   * rediscover that earlier lessons have more of everything.
   */
  discussionRate: number | null;
};

/**
 * Reach and completion for every lesson in a course, in course order, counting
 * only students whose cohort has had {@link MATURITY_WINDOW_DAYS} to work
 * through it.
 *
 * The two series are deliberately separate because they demand opposite
 * responses: a lesson few students *reach* means the material before it is
 * losing people, while a lesson many reach but few *finish* means that lesson
 * itself is the problem. Collapsing them into one series would erase that.
 *
 * All admitted cohorts pool into a single curve. Splitting by cohort would be
 * statistically cleaner and would divide an already small sample well below
 * {@link VERDICT_MIN_STUDENTS}, silencing the page's most valuable output.
 *
 * Lessons with no progress rows at all are still returned, at zero — a lesson
 * nobody has opened is the most interesting row on the chart, not a missing one.
 */
function getLessonReach(courseId: number): LessonReach[] {
  return (
    db
      .select({
        lessonId: lessons.id,
        title: lessons.title,
        modulePosition: modules.position,
        lessonPosition: lessons.position,
        // count(distinct …) rather than count(*): one student could in principle
        // carry more than one progress row, and that must not inflate reach.
        // The enrollment id being present is what makes the row mature — the
        // join below only matches enrollments that clear the maturity filter.
        reached: sql<number>`count(distinct case when ${enrollments.id} is not null then ${lessonProgress.userId} end)`,
        completed: sql<number>`count(distinct case when ${enrollments.id} is not null and ${lessonProgress.status} = ${LessonProgressStatus.Completed} then ${lessonProgress.userId} end)`,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      // Left join, so a lesson nobody has reached still produces a row at zero.
      .leftJoin(lessonProgress, eq(lessonProgress.lessonId, lessons.id))
      .leftJoin(
        enrollments,
        and(
          eq(enrollments.userId, lessonProgress.userId),
          eq(enrollments.courseId, courseId),
          isMatureCohort()
        )
      )
      .where(eq(modules.courseId, courseId))
      .groupBy(lessons.id)
      .orderBy(asc(modules.position), asc(lessons.position))
      .all()
  );
}

/**
 * Comments per lesson, counted from the same students the drop-off curve is
 * computed from.
 *
 * Two exclusions, both deliberate. Soft-deleted comments do not count — a
 * removed comment is not evidence of confusion. Neither do comments from anyone
 * not enrolled in a mature cohort, which drops the instructor's own replies (a
 * reply is the answer, not the question) and keeps the numerator on the same
 * population as the denominator. Counting every comment against a maturity-
 * filtered reach would inflate exactly the early lessons that recent students
 * are the only ones to have got to.
 */
function getLessonCommentCounts(courseId: number): Map<number, number> {
  const rows = db
    .select({
      lessonId: lessonComments.lessonId,
      comments: sql<number>`count(distinct ${lessonComments.id})`,
    })
    .from(lessonComments)
    .innerJoin(lessons, eq(lessons.id, lessonComments.lessonId))
    .innerJoin(
      modules,
      and(eq(modules.id, lessons.moduleId), eq(modules.courseId, courseId))
    )
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.userId, lessonComments.userId),
        eq(enrollments.courseId, courseId),
        isMatureCohort()
      )
    )
    .where(isNull(lessonComments.deletedAt))
    .groupBy(lessonComments.lessonId)
    .all();

  return new Map(rows.map((row) => [row.lessonId, row.comments]));
}

/**
 * The lesson drop-off curve with each lesson's discussion rate alongside it.
 *
 * The two travel together because the discussion rate is an annotation on a
 * lesson rather than a topic of its own: what an instructor wants to know is
 * whether the lesson people abandon is also the lesson they were asking about.
 */
export function getLessonDropOff(courseId: number): LessonDropOff[] {
  const commentCounts = getLessonCommentCounts(courseId);

  return getLessonReach(courseId).map((lesson) => {
    const comments = commentCounts.get(lesson.lessonId) ?? 0;

    return {
      ...lesson,
      comments,
      discussionRate: lesson.reached === 0 ? null : comments / lesson.reached,
    };
  });
}

export type DropOffSample = {
  /** Students the drop-off curve is computed from. */
  mature: number;
  /**
   * Students left out because they enrolled too recently. Displayed alongside
   * the chart: the adjustment has to be visible rather than a hidden hand on
   * the data.
   */
  excludedAsRecent: number;
};

/** Who the drop-off curve describes, and who it leaves out. */
export function getDropOffSample(courseId: number): DropOffSample {
  const row = db
    .select({
      enrolled: sql<number>`count(*)`,
      mature: sql<number>`sum(case when ${isMatureCohort()} then 1 else 0 end)`,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  const enrolled = row?.enrolled ?? 0;
  // sum() over no rows is null rather than 0.
  const mature = row?.mature ?? 0;

  return { mature, excludedAsRecent: enrolled - mature };
}

export type WorstDropOff = {
  /** The lesson students get to and stop at. */
  lessonId: number;
  title: string;
  /** 1-based position in course order — what "Lesson 7" means to an instructor. */
  order: number;
  /** Students who reached this lesson. The denominator of {@link percentage}. */
  reached: number;
  /** Of those, how many never reached the lesson after it. */
  dropped: number;
  /** `dropped` as a rounded percentage of `reached`. */
  percentage: number;
  /** The lesson they did not get to — where the fix may actually belong. */
  nextLessonId: number;
  nextTitle: string;
  /**
   * Whether enough students reached this lesson to state the claim outright.
   * Below the threshold the caller still renders the chart in full and withholds
   * only the interpretation.
   */
  meetsThreshold: boolean;
};

/**
 * The largest fall in reached-student count between consecutive lessons.
 *
 * Reach is the sole basis for this verdict. Completion is self-reported — it is
 * only written when a student clicks a button — so it partly measures
 * conscientiousness and must never drive a claim.
 *
 * Ties go to the earlier lesson: if a course loses the same number of students
 * twice, the first cliff is the one to fix, because everything after it is
 * downstream of it. Returns null when the curve never falls, which is the
 * honest answer for a course with no students or no lessons.
 */
export function findWorstDropOff(
  lessons: LessonReach[]
): WorstDropOff | null {
  let worst: WorstDropOff | null = null;

  for (let i = 0; i < lessons.length - 1; i++) {
    const from = lessons[i];
    const to = lessons[i + 1];
    const dropped = from.reached - to.reached;

    if (dropped <= 0 || (worst && dropped <= worst.dropped)) continue;

    worst = {
      lessonId: from.lessonId,
      title: from.title,
      order: i + 1,
      reached: from.reached,
      dropped,
      percentage: Math.round((dropped / from.reached) * 100),
      nextLessonId: to.lessonId,
      nextTitle: to.title,
      meetsThreshold: from.reached >= VERDICT_MIN_STUDENTS,
    };
  }

  return worst;
}

/**
 * The narrow read: one course's worst drop-off point and nothing else.
 *
 * Exists so the instructor course grid can put a finding on every card without
 * computing and discarding a full analytics payload per course.
 */
export function getWorstDropOff(courseId: number): WorstDropOff | null {
  // Reach only: the caller wants one finding, not a discussion rate per lesson.
  return findWorstDropOff(getLessonReach(courseId));
}

// ─── All-courses scope ───
// The same page read across every course the viewer may see. Not every metric
// survives being pooled, and the ones that do not are replaced rather than
// approximated — see `getCourseOverviewRows`.

export type AnalyticsCourse = {
  id: number;
  title: string;
  slug: string;
};

/**
 * The courses a viewer may read analytics for, and the exact list the scope
 * picker offers.
 *
 * An instructor sees their own; an admin sees every course, because supporting
 * instructors and investigating platform problems is the job. Anyone else gets
 * nothing — the picker must not become a way to enumerate courses, let alone
 * their revenue.
 */
export function listAnalyticsCourses(opts: {
  userId: number;
  role: UserRole;
}): AnalyticsCourse[] {
  if (opts.role !== UserRole.Admin && opts.role !== UserRole.Instructor) {
    return [];
  }

  const selection = db
    .select({ id: courses.id, title: courses.title, slug: courses.slug })
    .from(courses);

  const rows =
    opts.role === UserRole.Admin
      ? selection.orderBy(asc(courses.title)).all()
      : selection
          .where(eq(courses.instructorId, opts.userId))
          .orderBy(asc(courses.title))
          .all();

  return rows;
}

/**
 * Every course's students pooled into one distribution.
 *
 * Bands pool honestly because each one is a proportion of that student's *own*
 * course: someone 50% through a four-lesson course and someone 50% through a
 * forty-lesson course belong in the same band, and neither course's length
 * distorts the other. A student enrolled in two courses is counted once per
 * enrollment, which is right — they are at two different points.
 */
export function getPooledProgressDistribution(
  courseIds: number[]
): ProgressDistribution {
  const perCourse = courseIds.map(getProgressDistribution);

  const bands = PROGRESS_BANDS.map((band, index) => ({
    key: band.key,
    label: band.label,
    students: perCourse.reduce(
      (total, course) => total + course.bands[index].students,
      0
    ),
  }));

  const sum = (pick: (course: ProgressDistribution) => number) =>
    perCourse.reduce((total, course) => total + pick(course), 0);

  return {
    bands,
    totalStudents: sum((course) => course.totalStudents),
    neverStarted: sum((course) => course.neverStarted),
    completed: sum((course) => course.completed),
    lessonCount: sum((course) => course.lessonCount),
  };
}

/**
 * Revenue and seats summed across courses.
 *
 * These are money and coupons, so they add up with nothing lost: two courses
 * that collected $30 each collected $60 between them.
 */
export function getPooledRevenueSummary(
  courseIds: number[]
): CourseRevenueSummary {
  return courseIds.map(getCourseRevenueSummary).reduce(
    (total, course) => ({
      grossCollected: total.grossCollected + course.grossCollected,
      saleCount: total.saleCount + course.saleCount,
      seatsSold: total.seatsSold + course.seatsSold,
      seatsRedeemed: total.seatsRedeemed + course.seatsRedeemed,
    }),
    { grossCollected: 0, saleCount: 0, seatsSold: 0, seatsRedeemed: 0 }
  );
}

/**
 * The maturity adjustment across every course, summed.
 *
 * The filter itself still applies per course — cohorts are months of enrollment
 * *in a course*, and a student who is mature on one course may be a newcomer on
 * another. Only the totals are added up, so the exclusion stays as visible in
 * the pooled view as it is in a single course's.
 */
export function getPooledDropOffSample(courseIds: number[]): DropOffSample {
  return courseIds.map(getDropOffSample).reduce(
    (total, course) => ({
      mature: total.mature + course.mature,
      excludedAsRecent: total.excludedAsRecent + course.excludedAsRecent,
    }),
    { mature: 0, excludedAsRecent: 0 }
  );
}

export type CourseOverviewRow = AnalyticsCourse & {
  /** Enrolled students, the weight to read this row's finding with. */
  students: number;
  /** This course's own worst drop-off, or null where its curve never falls. */
  worstDropOff: WorstDropOff | null;
};

/**
 * One row per course: how many students it has and where it loses them.
 *
 * This is what the pooled view shows *instead* of a drop-off curve, because
 * drop-off is the one thing that cannot be pooled — "lesson 7" means a
 * different thing in every course, and a curve laid across several of them
 * would be an artefact of how they happen to line up rather than a finding.
 *
 * Each row carries its own verdict threshold with it, so a course with sixty
 * students can state a claim while its three-student neighbour says it is still
 * gathering data. Courses nobody has enrolled in skip the read entirely: there
 * is nothing to find and no reason to pay for the query.
 */
export function getCourseOverviewRows(
  coursesToRead: AnalyticsCourse[]
): CourseOverviewRow[] {
  return coursesToRead.map((course) => {
    const students = getEnrolledStudentCount(course.id);

    return {
      ...course,
      students,
      worstDropOff: students > 0 ? getWorstDropOff(course.id) : null,
    };
  });
}

/**
 * How far above its own course a lesson's discussion rate has to sit before it
 * is called out.
 *
 * The comparison is intra-course and nothing else. What counts as a chatty
 * lesson depends entirely on the subject and the instructor, so a platform
 * average or another course's rate would be measuring the wrong thing.
 */
export const DISCUSSION_OUTLIER_MULTIPLE = 2;

/**
 * Comments a lesson needs before its rate can be flagged at all.
 *
 * Without this, one stray comment on a lesson two people reached is a rate of
 * 0.5 and beats the median of a quiet course — a "finding" made of a single
 * sentence. Same instinct as the verdict threshold: a claim needs enough behind
 * it to survive being questioned.
 */
export const DISCUSSION_MIN_COMMENTS = 3;

export type DiscussionSignal = {
  /**
   * The course's own typical rate, across lessons somebody reached. This is the
   * bar everything is compared against.
   */
  medianRate: number;
  /** Lessons whose discussion runs well above that bar. */
  flaggedLessonIds: number[];
  /**
   * Whether the course has any discussion at all. With none, the column is
   * dropped rather than filled with zeroes down its whole length.
   */
  hasComments: boolean;
};

function median(values: number[]) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Which lessons are generating far more questions than their traffic warrants.
 *
 * A lesson with a high rate is where students are getting stuck, and unlike a
 * drop-off number this signal comes with the text of what confused them.
 *
 * When the median is zero — the usual case, since most lessons in most courses
 * attract nothing — any discussed lesson is by definition unusual for that
 * course, so the minimum-comment floor is what stops the flag firing on noise.
 */
export function analyzeDiscussion(lessons: LessonDropOff[]): DiscussionSignal {
  const rates = lessons
    .filter((lesson) => lesson.discussionRate !== null)
    .map((lesson) => lesson.discussionRate as number);

  const medianRate = median(rates);
  const hasComments = lessons.some((lesson) => lesson.comments > 0);

  const flaggedLessonIds = lessons
    .filter((lesson) => {
      if (lesson.discussionRate === null) return false;
      if (lesson.comments < DISCUSSION_MIN_COMMENTS) return false;

      return medianRate > 0
        ? lesson.discussionRate >= medianRate * DISCUSSION_OUTLIER_MULTIPLE
        : lesson.discussionRate > 0;
    })
    .map((lesson) => lesson.lessonId);

  return { medianRate, flaggedLessonIds, hasComments };
}
