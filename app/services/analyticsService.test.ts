import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  analyzeDiscussion,
  findWorstDropOff,
  getCompletionSummary,
  getCourseOverviewRows,
  getCourseRevenueSummary,
  getDropOffSample,
  getEnrolledStudentCount,
  getLessonDropOff,
  getPooledDropOffSample,
  getPooledProgressDistribution,
  getPooledRevenueSummary,
  getProgressDistribution,
  getWorstDropOff,
  listAnalyticsCourses,
  progressBandFor,
  summarizeCompletion,
  VERDICT_MIN_STUDENTS,
} from "./analyticsService";
import type { LessonDropOff, LessonReach } from "./analyticsService";

function createStudent(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function enroll(userId: number, courseId: number) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId })
    .returning()
    .get();
}

function enrollAt(opts: {
  userId: number;
  courseId: number;
  enrolledAt: string;
}) {
  return testDb.insert(schema.enrollments).values(opts).returning().get();
}

/**
 * Enrolled four months back, so the cohort's month closed long ago and it is
 * unambiguously inside the maturity window whatever today's date is.
 */
function enrollMature(opts: { userId: number; courseId: number }) {
  return enrollAt({ ...opts, enrolledAt: daysAgoIso(120) });
}

/**
 * Enrolled today. The cohort's month has not even ended, so it can never be
 * mature — which keeps this test independent of what day of the month it runs.
 */
function enrollRecent(opts: { userId: number; courseId: number }) {
  return enrollAt({ ...opts, enrolledAt: new Date().toISOString() });
}

/** A student who is enrolled long enough ago to count towards drop-off. */
function createMatureStudent(name: string, courseId: number) {
  const student = createStudent(name);
  enrollMature({ userId: student.id, courseId });
  return student;
}

function enrollCompleted(userId: number, courseId: number) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, completedAt: new Date().toISOString() })
    .returning()
    .get();
}

/** A course's lessons, in one module, in order. */
function createLessons(opts: { courseId: number; count: number }) {
  const module = createModule({
    courseId: opts.courseId,
    title: "Module One",
    position: 1,
  });

  return Array.from({ length: opts.count }, (_, index) =>
    createLesson({
      moduleId: module.id,
      title: `Lesson ${index + 1}`,
      position: index + 1,
    })
  );
}

/**
 * An enrolled student who has completed the first `completedLessons` of the
 * course — the shape progress actually has, since students work in order.
 */
function studentWhoCompleted(opts: {
  name: string;
  courseId: number;
  lessons: { id: number }[];
  completedLessons: number;
}) {
  const student = createStudent(opts.name);
  enroll(student.id, opts.courseId);

  for (const lesson of opts.lessons.slice(0, opts.completedLessons)) {
    complete({ userId: student.id, lessonId: lesson.id });
  }

  return student;
}

function purchase(opts: {
  userId: number;
  courseId: number;
  pricePaid: number;
}) {
  return testDb.insert(schema.purchases).values(opts).returning().get();
}

function createInstructor(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();
}

function createAdmin(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();
}

function createCourse(opts: { title: string; instructorId: number }) {
  return testDb
    .insert(schema.courses)
    .values({
      title: opts.title,
      slug: opts.title.toLowerCase().replace(/\s+/g, "-"),
      description: `${opts.title} description`,
      instructorId: opts.instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function createOtherCourse() {
  return testDb
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Another course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

/**
 * A team purchase: one purchase record carrying several coupons. Sale count and
 * seat count come apart here, which is exactly what the tiles have to convey.
 */
function teamPurchase(opts: {
  buyerId: number;
  courseId: number;
  pricePaid: number;
  seats: number;
  redeemedBy?: number[];
}) {
  const team = testDb.insert(schema.teams).values({}).returning().get();

  const bought = purchase({
    userId: opts.buyerId,
    courseId: opts.courseId,
    pricePaid: opts.pricePaid,
  });

  const redeemedBy = opts.redeemedBy ?? [];

  for (let i = 0; i < opts.seats; i++) {
    testDb
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: opts.courseId,
        code: `SEAT-${opts.courseId}-${team.id}-${i}`,
        purchaseId: bought.id,
        redeemedByUserId: redeemedBy[i] ?? null,
        redeemedAt: redeemedBy[i] ? new Date().toISOString() : null,
      })
      .run();
  }

  return { team, purchase: bought };
}

function createModule(opts: {
  courseId: number;
  title: string;
  position: number;
}) {
  return testDb.insert(schema.modules).values(opts).returning().get();
}

function createLesson(opts: {
  moduleId: number;
  title: string;
  position: number;
}) {
  return testDb.insert(schema.lessons).values(opts).returning().get();
}

function addComment(opts: {
  userId: number;
  lessonId: number;
  deleted?: boolean;
}) {
  return testDb
    .insert(schema.lessonComments)
    .values({
      userId: opts.userId,
      lessonId: opts.lessonId,
      body: "Wait, why does this work?",
      deletedAt: opts.deleted ? new Date().toISOString() : null,
    })
    .returning()
    .get();
}

/** `count` comments on a lesson, each from a different mature student. */
function addComments(opts: {
  lessonId: number;
  courseId: number;
  count: number;
  label: string;
}) {
  for (let i = 0; i < opts.count; i++) {
    const student = createMatureStudent(`${opts.label} ${i}`, opts.courseId);
    reach({ userId: student.id, lessonId: opts.lessonId });
    addComment({ userId: student.id, lessonId: opts.lessonId });
  }
}

/** Reach: a progress row in any state. Defaults to the weakest one. */
function reach(opts: {
  userId: number;
  lessonId: number;
  status?: schema.LessonProgressStatus;
}) {
  return testDb
    .insert(schema.lessonProgress)
    .values({
      userId: opts.userId,
      lessonId: opts.lessonId,
      status: opts.status ?? schema.LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}

function complete(opts: { userId: number; lessonId: number }) {
  return reach({ ...opts, status: schema.LessonProgressStatus.Completed });
}

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getEnrolledStudentCount", () => {
    it("returns zero for a course with no enrollments", () => {
      expect(getEnrolledStudentCount(base.course.id)).toBe(0);
    });

    it("counts every student enrolled in the course", () => {
      enroll(base.user.id, base.course.id);
      enroll(createStudent("Second Student").id, base.course.id);
      enroll(createStudent("Third Student").id, base.course.id);

      expect(getEnrolledStudentCount(base.course.id)).toBe(3);
    });

    it("does not count enrollments belonging to another course", () => {
      const otherCourse = createOtherCourse();

      enroll(base.user.id, base.course.id);
      enroll(createStudent("Other Student").id, otherCourse.id);

      expect(getEnrolledStudentCount(base.course.id)).toBe(1);
      expect(getEnrolledStudentCount(otherCourse.id)).toBe(1);
    });

    it("returns zero for a course id that does not exist", () => {
      expect(getEnrolledStudentCount(999999)).toBe(0);
    });
  });

  describe("getCompletionSummary", () => {
    it("returns a null rate for a course with no students", () => {
      expect(getCompletionSummary(base.course.id)).toEqual({
        enrolled: 0,
        completed: 0,
        rate: null,
      });
    });

    it("counts students who have completed every lesson", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 4 });

      studentWhoCompleted({
        name: "Finished",
        courseId: base.course.id,
        lessons,
        completedLessons: 4,
      });
      studentWhoCompleted({
        name: "Also Finished",
        courseId: base.course.id,
        lessons,
        completedLessons: 4,
      });
      studentWhoCompleted({
        name: "Nearly There",
        courseId: base.course.id,
        lessons,
        completedLessons: 3,
      });
      enroll(createStudent("Never Started").id, base.course.id);

      expect(getCompletionSummary(base.course.id)).toEqual({
        enrolled: 4,
        completed: 2,
        rate: 50,
      });
    });

    it("does not count a student who has one lesson left", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 20 });
      studentWhoCompleted({
        name: "Nineteen Of Twenty",
        courseId: base.course.id,
        lessons,
        completedLessons: 19,
      });

      expect(getCompletionSummary(base.course.id).completed).toBe(0);
    });

    it("rounds the rate", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 2 });

      studentWhoCompleted({
        name: "Finished",
        courseId: base.course.id,
        lessons,
        completedLessons: 2,
      });
      enroll(createStudent("Second").id, base.course.id);
      enroll(createStudent("Third").id, base.course.id);

      expect(getCompletionSummary(base.course.id).rate).toBe(33);
    });

    it("reports 100 when every student has finished", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 3 });
      studentWhoCompleted({
        name: "Finished",
        courseId: base.course.id,
        lessons,
        completedLessons: 3,
      });

      expect(getCompletionSummary(base.course.id).rate).toBe(100);
    });

    it("derives completion from lesson progress rather than the enrollment stamp", () => {
      // A stamp that lesson progress does not support is not evidence of
      // anything. Where the two could ever disagree, this figure is the correct
      // one and the roster is the one to fix.
      createLessons({ courseId: base.course.id, count: 3 });
      enrollCompleted(base.user.id, base.course.id);

      expect(getCompletionSummary(base.course.id)).toEqual({
        enrolled: 1,
        completed: 0,
        rate: 0,
      });
    });

    it("does not count completions on another course", () => {
      const otherCourse = createOtherCourse();
      const otherLessons = createLessons({
        courseId: otherCourse.id,
        count: 2,
      });
      createLessons({ courseId: base.course.id, count: 2 });

      enroll(base.user.id, base.course.id);
      for (const lesson of otherLessons) {
        complete({ userId: base.user.id, lessonId: lesson.id });
      }

      expect(getCompletionSummary(base.course.id)).toEqual({
        enrolled: 1,
        completed: 0,
        rate: 0,
      });
    });
  });

  describe("progressBandFor", () => {
    it("puts a student who has completed nothing in the 0% band", () => {
      expect(progressBandFor({ completedLessons: 0, lessonCount: 20 })).toBe(
        "0"
      );
    });

    it("puts a student who has completed everything in the 100% band", () => {
      expect(progressBandFor({ completedLessons: 20, lessonCount: 20 })).toBe(
        "100"
      );
    });

    it("keeps a single completed lesson out of the 0% band", () => {
      expect(progressBandFor({ completedLessons: 1, lessonCount: 100 })).toBe(
        "1-25"
      );
    });

    it("keeps a student one lesson short out of the 100% band", () => {
      // 249 of 250 rounds to 100% and is not finished. The exact ratio decides,
      // never a rounded percentage.
      expect(progressBandFor({ completedLessons: 249, lessonCount: 250 })).toBe(
        "76-99"
      );
    });

    it("closes each band at its upper bound", () => {
      const bandAt = (completedLessons: number) =>
        progressBandFor({ completedLessons, lessonCount: 100 });

      expect(bandAt(25)).toBe("1-25");
      expect(bandAt(26)).toBe("26-50");
      expect(bandAt(50)).toBe("26-50");
      expect(bandAt(51)).toBe("51-75");
      expect(bandAt(75)).toBe("51-75");
      expect(bandAt(76)).toBe("76-99");
      expect(bandAt(99)).toBe("76-99");
    });

    it("handles a one-lesson course, where the only two bands are 0 and 100", () => {
      expect(progressBandFor({ completedLessons: 0, lessonCount: 1 })).toBe("0");
      expect(progressBandFor({ completedLessons: 1, lessonCount: 1 })).toBe(
        "100"
      );
    });

    it("puts everyone at 0% when the course has no lessons to complete", () => {
      expect(progressBandFor({ completedLessons: 0, lessonCount: 0 })).toBe("0");
    });
  });

  describe("getProgressDistribution", () => {
    it("returns all six bands even for a course nobody is enrolled on", () => {
      expect(getProgressDistribution(base.course.id)).toEqual({
        bands: [
          { key: "0", label: "0%", students: 0 },
          { key: "1-25", label: "1–25%", students: 0 },
          { key: "26-50", label: "26–50%", students: 0 },
          { key: "51-75", label: "51–75%", students: 0 },
          { key: "76-99", label: "76–99%", students: 0 },
          { key: "100", label: "100%", students: 0 },
        ],
        totalStudents: 0,
        neverStarted: 0,
        completed: 0,
        lessonCount: 0,
      });
    });

    it("spreads students across the bands by how far they got", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 8 });

      const depths = [0, 1, 2, 3, 5, 7, 8, 8];
      depths.forEach((completedLessons, index) => {
        studentWhoCompleted({
          name: `Student ${index}`,
          courseId: base.course.id,
          lessons,
          completedLessons,
        });
      });

      const distribution = getProgressDistribution(base.course.id);

      expect(
        distribution.bands.map((band) => [band.key, band.students])
      ).toEqual([
        ["0", 1], // 0 of 8
        ["1-25", 2], // 1 of 8 (13%) and 2 of 8 (25%)
        ["26-50", 1], // 3 of 8 (38%)
        ["51-75", 1], // 5 of 8 (63%)
        ["76-99", 1], // 7 of 8 (88%)
        ["100", 2], // 8 of 8, twice
      ]);
      expect(distribution.totalStudents).toBe(8);
      expect(distribution.lessonCount).toBe(8);
    });

    it("counts enrolled students who never opened a lesson as the 0% band", () => {
      createLessons({ courseId: base.course.id, count: 4 });
      enroll(base.user.id, base.course.id);
      enroll(createStudent("Also Absent").id, base.course.id);

      const distribution = getProgressDistribution(base.course.id);

      expect(distribution.neverStarted).toBe(2);
      expect(distribution.bands[0]).toMatchObject({ key: "0", students: 2 });
    });

    it("does not count a merely opened lesson as progress", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 4 });
      const student = createStudent("Opened But Did Not Finish");
      enroll(student.id, base.course.id);
      reach({ userId: student.id, lessonId: lessons[0].id });

      expect(getProgressDistribution(base.course.id).neverStarted).toBe(1);
    });

    it("agrees with the completion summary by construction", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 5 });
      studentWhoCompleted({
        name: "Finished",
        courseId: base.course.id,
        lessons,
        completedLessons: 5,
      });
      studentWhoCompleted({
        name: "Halfway",
        courseId: base.course.id,
        lessons,
        completedLessons: 2,
      });

      const distribution = getProgressDistribution(base.course.id);
      const summary = summarizeCompletion(distribution);

      expect(distribution.completed).toBe(1);
      expect(summary).toEqual({ enrolled: 2, completed: 1, rate: 50 });
    });

    it("ignores progress a student made on another course", () => {
      const otherCourse = createOtherCourse();
      const otherLessons = createLessons({
        courseId: otherCourse.id,
        count: 4,
      });
      createLessons({ courseId: base.course.id, count: 4 });

      enroll(base.user.id, base.course.id);
      for (const lesson of otherLessons) {
        complete({ userId: base.user.id, lessonId: lesson.id });
      }

      expect(getProgressDistribution(base.course.id)).toMatchObject({
        totalStudents: 1,
        neverStarted: 1,
        completed: 0,
      });
    });

    it("does not count anyone as finished on a course with no lessons", () => {
      enroll(base.user.id, base.course.id);

      expect(getProgressDistribution(base.course.id)).toMatchObject({
        lessonCount: 0,
        totalStudents: 1,
        neverStarted: 1,
        completed: 0,
      });
    });

    it("counts a student once even with duplicate progress rows", () => {
      const lessons = createLessons({ courseId: base.course.id, count: 2 });
      enroll(base.user.id, base.course.id);
      complete({ userId: base.user.id, lessonId: lessons[0].id });
      complete({ userId: base.user.id, lessonId: lessons[0].id });

      expect(getProgressDistribution(base.course.id)).toMatchObject({
        totalStudents: 1,
        bands: expect.arrayContaining([
          { key: "26-50", label: "26–50%", students: 1 },
        ]),
      });
    });
  });

  describe("getCourseRevenueSummary", () => {
    it("returns zeroes for a course that has never sold", () => {
      expect(getCourseRevenueSummary(base.course.id)).toEqual({
        grossCollected: 0,
        saleCount: 0,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
    });

    it("sums what students actually paid rather than list price", () => {
      // Regional pricing: the same course sold at three different amounts.
      purchase({ userId: base.user.id, courseId: base.course.id, pricePaid: 9900 });
      purchase({
        userId: createStudent("Discounted").id,
        courseId: base.course.id,
        pricePaid: 4950,
      });
      purchase({
        userId: createStudent("Also Discounted").id,
        courseId: base.course.id,
        pricePaid: 5940,
      });

      const summary = getCourseRevenueSummary(base.course.id);

      expect(summary.grossCollected).toBe(20790);
      expect(summary.saleCount).toBe(3);
    });

    it("counts a team purchase as one sale carrying several seats", () => {
      const redeemer = createStudent("Redeemer");
      teamPurchase({
        buyerId: base.user.id,
        courseId: base.course.id,
        pricePaid: 45000,
        seats: 5,
        redeemedBy: [redeemer.id],
      });

      expect(getCourseRevenueSummary(base.course.id)).toEqual({
        grossCollected: 45000,
        saleCount: 1,
        seatsSold: 5,
        seatsRedeemed: 1,
      });
    });

    it("counts every seat as redeemed when the whole block is claimed", () => {
      const a = createStudent("Seat A");
      const b = createStudent("Seat B");
      teamPurchase({
        buyerId: base.user.id,
        courseId: base.course.id,
        pricePaid: 18000,
        seats: 2,
        redeemedBy: [a.id, b.id],
      });

      const summary = getCourseRevenueSummary(base.course.id);

      expect(summary.seatsSold).toBe(2);
      expect(summary.seatsRedeemed).toBe(2);
    });

    it("combines individual sales with a team block", () => {
      purchase({ userId: base.user.id, courseId: base.course.id, pricePaid: 9900 });
      teamPurchase({
        buyerId: createStudent("Team Admin").id,
        courseId: base.course.id,
        pricePaid: 45000,
        seats: 5,
      });

      expect(getCourseRevenueSummary(base.course.id)).toEqual({
        grossCollected: 54900,
        saleCount: 2,
        seatsSold: 5,
        seatsRedeemed: 0,
      });
    });

    it("reads zero for a free course with enrolled students", () => {
      enroll(base.user.id, base.course.id);
      enroll(createStudent("Free Rider").id, base.course.id);

      const summary = getCourseRevenueSummary(base.course.id);

      expect(summary).toEqual({
        grossCollected: 0,
        saleCount: 0,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
      expect(getEnrolledStudentCount(base.course.id)).toBe(2);
    });

    it("reports revenue on a course whose seats nobody has redeemed", () => {
      teamPurchase({
        buyerId: base.user.id,
        courseId: base.course.id,
        pricePaid: 45000,
        seats: 5,
      });

      const summary = getCourseRevenueSummary(base.course.id);

      expect(summary.grossCollected).toBe(45000);
      expect(summary.seatsRedeemed).toBe(0);
      // Revenue exists with nobody enrolled — the seats were sold, not claimed.
      expect(getEnrolledStudentCount(base.course.id)).toBe(0);
    });

    it("does not mix in another course's purchases or seats", () => {
      const otherCourse = createOtherCourse();

      purchase({ userId: base.user.id, courseId: base.course.id, pricePaid: 9900 });
      purchase({
        userId: base.user.id,
        courseId: otherCourse.id,
        pricePaid: 12300,
      });
      teamPurchase({
        buyerId: createStudent("Other Admin").id,
        courseId: otherCourse.id,
        pricePaid: 45000,
        seats: 5,
      });

      expect(getCourseRevenueSummary(base.course.id)).toEqual({
        grossCollected: 9900,
        saleCount: 1,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
    });
  });

  describe("getLessonDropOff", () => {
    it("returns nothing for a course with no lessons", () => {
      expect(getLessonDropOff(base.course.id)).toEqual([]);
    });

    it("returns every lesson at zero when nobody has opened them", () => {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      createLesson({ moduleId: module.id, title: "Intro", position: 1 });
      createLesson({ moduleId: module.id, title: "Setup", position: 2 });

      const rows = getLessonDropOff(base.course.id);

      expect(rows.map((r) => [r.title, r.reached, r.completed])).toEqual([
        ["Intro", 0, 0],
        ["Setup", 0, 0],
      ]);
    });

    it("orders lessons by module position, then lesson position", () => {
      // Inserted out of order deliberately: the ordering must come from the
      // position columns, not from insertion order or lesson id.
      const second = createModule({
        courseId: base.course.id,
        title: "Module Two",
        position: 2,
      });
      const first = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });

      createLesson({ moduleId: second.id, title: "2.2", position: 2 });
      createLesson({ moduleId: first.id, title: "1.2", position: 2 });
      createLesson({ moduleId: second.id, title: "2.1", position: 1 });
      createLesson({ moduleId: first.id, title: "1.1", position: 1 });

      expect(getLessonDropOff(base.course.id).map((r) => r.title)).toEqual([
        "1.1",
        "1.2",
        "2.1",
        "2.2",
      ]);
    });

    it("counts a progress row in any state as reached", () => {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      const lesson = createLesson({
        moduleId: module.id,
        title: "Intro",
        position: 1,
      });

      enrollMature({ userId: base.user.id, courseId: base.course.id });

      reach({
        userId: base.user.id,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.NotStarted,
      });
      reach({
        userId: createMatureStudent("In Progress", base.course.id).id,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.InProgress,
      });
      complete({
        userId: createMatureStudent("Finished", base.course.id).id,
        lessonId: lesson.id,
      });

      expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
        title: "Intro",
        reached: 3,
        completed: 1,
      });
    });

    it("separates students who reached a lesson from those who finished it", () => {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      const intro = createLesson({
        moduleId: module.id,
        title: "Intro",
        position: 1,
      });
      const hard = createLesson({
        moduleId: module.id,
        title: "The Hard One",
        position: 2,
      });

      enrollMature({ userId: base.user.id, courseId: base.course.id });
      const students = [
        base.user,
        createMatureStudent("Second", base.course.id),
        createMatureStudent("Third", base.course.id),
        createMatureStudent("Fourth", base.course.id),
      ];

      // Everyone gets through the intro; everyone opens the hard lesson but
      // only one finishes it. This is the "many reach, few finish" shape.
      for (const student of students) {
        complete({ userId: student.id, lessonId: intro.id });
        reach({ userId: student.id, lessonId: hard.id });
      }
      complete({ userId: students[0].id, lessonId: hard.id });

      expect(getLessonDropOff(base.course.id)).toMatchObject([
        { title: "Intro", reached: 4, completed: 4 },
        { title: "The Hard One", reached: 4, completed: 1 },
      ]);
    });

    it("counts a student once per lesson even with several progress rows", () => {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      const lesson = createLesson({
        moduleId: module.id,
        title: "Intro",
        position: 1,
      });

      enrollMature({ userId: base.user.id, courseId: base.course.id });
      reach({ userId: base.user.id, lessonId: lesson.id });
      complete({ userId: base.user.id, lessonId: lesson.id });

      expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
        reached: 1,
        completed: 1,
      });
    });

    it("carries the lesson id and positions needed to link back to the editor", () => {
      const module = createModule({
        courseId: base.course.id,
        title: "Module Two",
        position: 2,
      });
      const lesson = createLesson({
        moduleId: module.id,
        title: "Deep Dive",
        position: 3,
      });

      expect(getLessonDropOff(base.course.id)).toEqual([
        {
          lessonId: lesson.id,
          title: "Deep Dive",
          modulePosition: 2,
          lessonPosition: 3,
          reached: 0,
          completed: 0,
          comments: 0,
          // No denominator: nobody reached the lesson, so there is no rate.
          discussionRate: null,
        },
      ]);
    });

    it("does not include lessons belonging to another course", () => {
      const otherCourse = createOtherCourse();

      const mine = createModule({
        courseId: base.course.id,
        title: "Mine",
        position: 1,
      });
      const theirs = createModule({
        courseId: otherCourse.id,
        title: "Theirs",
        position: 1,
      });

      createLesson({ moduleId: mine.id, title: "My Lesson", position: 1 });
      const theirLesson = createLesson({
        moduleId: theirs.id,
        title: "Their Lesson",
        position: 1,
      });
      enrollMature({ userId: base.user.id, courseId: otherCourse.id });
      complete({ userId: base.user.id, lessonId: theirLesson.id });

      expect(getLessonDropOff(base.course.id).map((r) => r.title)).toEqual([
        "My Lesson",
      ]);
      expect(getLessonDropOff(base.course.id)[0].reached).toBe(0);
    });

    describe("the maturity filter", () => {
      function singleLesson() {
        const module = createModule({
          courseId: base.course.id,
          title: "Module One",
          position: 1,
        });
        return createLesson({
          moduleId: module.id,
          title: "Intro",
          position: 1,
        });
      }

      it("excludes students who enrolled too recently to have progressed", () => {
        const lesson = singleLesson();

        const mature = createMatureStudent("Long Enough", base.course.id);
        const recent = createStudent("Just Arrived");
        enrollRecent({ userId: recent.id, courseId: base.course.id });

        complete({ userId: mature.id, lessonId: lesson.id });
        complete({ userId: recent.id, lessonId: lesson.id });

        expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
          reached: 1,
          completed: 1,
        });
      });

      it("pools every mature cohort into one curve", () => {
        const lesson = singleLesson();

        // Three different months, all closed well over 30 days ago.
        for (const [name, days] of [
          ["Cohort A", 200],
          ["Cohort B", 150],
          ["Cohort C", 100],
        ] as const) {
          const student = createStudent(name);
          enrollAt({
            userId: student.id,
            courseId: base.course.id,
            enrolledAt: daysAgoIso(days),
          });
          reach({ userId: student.id, lessonId: lesson.id });
        }

        expect(getLessonDropOff(base.course.id)[0].reached).toBe(3);
      });

      it("gives every student enrolled in the same month the same fate", () => {
        const lesson = singleLesson();

        // Both enrolled this calendar month, whose cohort has not closed yet.
        // Whichever day of the month the suite runs on, neither counts.
        const early = createStudent("Early In The Month");
        const late = createStudent("Late In The Month");
        enrollAt({
          userId: early.id,
          courseId: base.course.id,
          enrolledAt: new Date(
            new Date().setUTCDate(1)
          ).toISOString(),
        });
        enrollRecent({ userId: late.id, courseId: base.course.id });

        reach({ userId: early.id, lessonId: lesson.id });
        reach({ userId: late.id, lessonId: lesson.id });

        expect(getLessonDropOff(base.course.id)[0].reached).toBe(0);
      });

      it("does not count progress from a student enrolled on another course", () => {
        const lesson = singleLesson();
        const otherCourse = createOtherCourse();

        const outsider = createStudent("Enrolled Elsewhere");
        enrollMature({ userId: outsider.id, courseId: otherCourse.id });
        complete({ userId: outsider.id, lessonId: lesson.id });

        expect(getLessonDropOff(base.course.id)[0].reached).toBe(0);
      });
    });
  });

  describe("the discussion rate", () => {
    function twoLessons() {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      return [1, 2].map((position) =>
        createLesson({
          moduleId: module.id,
          title: `Lesson ${position}`,
          position,
        })
      );
    }

    it("leaves every lesson at zero on a course nobody has commented on", () => {
      const lessons = twoLessons();
      const student = createMatureStudent("Silent", base.course.id);
      reach({ userId: student.id, lessonId: lessons[0].id });

      expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
        comments: 0,
        discussionRate: 0,
      });
    });

    it("divides comments by the students who reached the lesson", () => {
      const lessons = twoLessons();
      addComments({
        lessonId: lessons[0].id,
        courseId: base.course.id,
        count: 2,
        label: "Asker",
      });
      // Two more students reached it without saying anything: 2 comments over
      // 4 students who got there.
      for (const name of ["Quiet A", "Quiet B"]) {
        const student = createMatureStudent(name, base.course.id);
        reach({ userId: student.id, lessonId: lessons[0].id });
      }

      expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
        reached: 4,
        comments: 2,
        discussionRate: 0.5,
      });
    });

    it("has no rate for a lesson nobody has reached", () => {
      twoLessons();

      expect(getLessonDropOff(base.course.id)[0].discussionRate).toBeNull();
    });

    it("does not count a soft-deleted comment", () => {
      const lessons = twoLessons();
      const student = createMatureStudent("Deleted Theirs", base.course.id);
      reach({ userId: student.id, lessonId: lessons[0].id });
      addComment({ userId: student.id, lessonId: lessons[0].id });
      addComment({
        userId: student.id,
        lessonId: lessons[0].id,
        deleted: true,
      });

      expect(getLessonDropOff(base.course.id)[0].comments).toBe(1);
    });

    it("does not count the instructor's own replies", () => {
      // A reply is the answer, not the question. Counting it would make a
      // well-supported lesson look like a confusing one.
      const lessons = twoLessons();
      const student = createMatureStudent("Asker", base.course.id);
      reach({ userId: student.id, lessonId: lessons[0].id });
      addComment({ userId: student.id, lessonId: lessons[0].id });
      addComment({ userId: base.instructor.id, lessonId: lessons[0].id });

      expect(getLessonDropOff(base.course.id)[0].comments).toBe(1);
    });

    it("counts comments from the same students the curve is computed from", () => {
      // A recent student's comments would otherwise land on the early lessons
      // they are the only ones to have reached, inflating exactly the rates
      // the normalization exists to make comparable.
      const lessons = twoLessons();
      const recent = createStudent("Just Arrived");
      enrollRecent({ userId: recent.id, courseId: base.course.id });
      reach({ userId: recent.id, lessonId: lessons[0].id });
      addComment({ userId: recent.id, lessonId: lessons[0].id });

      expect(getLessonDropOff(base.course.id)[0]).toMatchObject({
        reached: 0,
        comments: 0,
        discussionRate: null,
      });
    });

    it("keeps each lesson's comments to itself", () => {
      const lessons = twoLessons();
      addComments({
        lessonId: lessons[1].id,
        courseId: base.course.id,
        count: 3,
        label: "Second Lesson Asker",
      });

      const rows = getLessonDropOff(base.course.id);

      expect(rows[0].comments).toBe(0);
      expect(rows[1].comments).toBe(3);
    });
  });

  describe("analyzeDiscussion", () => {
    function rows(
      specs: { reached: number; comments: number }[]
    ): LessonDropOff[] {
      return specs.map((spec, index) => ({
        lessonId: (index + 1) * 10,
        title: `Lesson ${index + 1}`,
        modulePosition: 1,
        lessonPosition: index + 1,
        reached: spec.reached,
        completed: spec.reached,
        comments: spec.comments,
        discussionRate:
          spec.reached === 0 ? null : spec.comments / spec.reached,
      }));
    }

    it("reports no discussion for a course nobody has commented on", () => {
      const signal = analyzeDiscussion(
        rows([
          { reached: 40, comments: 0 },
          { reached: 30, comments: 0 },
        ])
      );

      expect(signal).toEqual({
        medianRate: 0,
        flaggedLessonIds: [],
        hasComments: false,
      });
    });

    it("takes the median across the course's own lessons", () => {
      const signal = analyzeDiscussion(
        rows([
          { reached: 10, comments: 1 }, // 0.1
          { reached: 10, comments: 2 }, // 0.2
          { reached: 10, comments: 6 }, // 0.6
        ])
      );

      expect(signal.medianRate).toBe(0.2);
    });

    it("averages the middle pair when the course has an even number of lessons", () => {
      const signal = analyzeDiscussion(
        rows([
          { reached: 10, comments: 1 }, // 0.1
          { reached: 10, comments: 2 }, // 0.2
          { reached: 10, comments: 4 }, // 0.4
          { reached: 10, comments: 9 }, // 0.9
        ])
      );

      expect(signal.medianRate).toBeCloseTo(0.3);
    });

    it("flags a lesson whose rate runs well above the course median", () => {
      const lessons = rows([
        { reached: 40, comments: 4 }, // 0.10
        { reached: 40, comments: 4 }, // 0.10
        { reached: 40, comments: 4 }, // 0.10
        { reached: 30, comments: 24 }, // 0.80 — the spike
      ]);

      expect(analyzeDiscussion(lessons).flaggedLessonIds).toEqual([
        lessons[3].lessonId,
      ]);
    });

    it("does not flag a lesson sitting at its course's ordinary level", () => {
      const lessons = rows([
        { reached: 40, comments: 8 },
        { reached: 40, comments: 8 },
        { reached: 40, comments: 9 },
      ]);

      expect(analyzeDiscussion(lessons).flaggedLessonIds).toEqual([]);
    });

    it("judges each course against itself, never against another", () => {
      // The same rate — 0.3 — is unremarkable in a chatty course and a clear
      // outlier in a quiet one. Only the course's own median decides.
      const chatty = rows([
        { reached: 20, comments: 6 }, // 0.3
        { reached: 20, comments: 8 },
        { reached: 20, comments: 7 },
      ]);
      const quiet = rows([
        { reached: 20, comments: 6 }, // 0.3
        { reached: 20, comments: 1 },
        { reached: 20, comments: 1 },
      ]);

      expect(analyzeDiscussion(chatty).flaggedLessonIds).toEqual([]);
      expect(analyzeDiscussion(quiet).flaggedLessonIds).toEqual([
        quiet[0].lessonId,
      ]);
    });

    it("flags a discussed lesson in a course where nothing else is discussed", () => {
      const lessons = rows([
        { reached: 40, comments: 0 },
        { reached: 40, comments: 0 },
        { reached: 40, comments: 0 },
        { reached: 20, comments: 5 },
      ]);

      const signal = analyzeDiscussion(lessons);

      expect(signal.medianRate).toBe(0);
      expect(signal.flaggedLessonIds).toEqual([lessons[3].lessonId]);
    });

    it("will not build a finding out of one or two comments", () => {
      // A rate of 1.0 on a lesson two people reached is a sentence, not a
      // signal.
      const lessons = rows([
        { reached: 40, comments: 0 },
        { reached: 40, comments: 0 },
        { reached: 2, comments: 2 },
      ]);

      expect(analyzeDiscussion(lessons).flaggedLessonIds).toEqual([]);
      expect(analyzeDiscussion(lessons).hasComments).toBe(true);
    });

    it("ignores lessons nobody has reached", () => {
      const lessons = rows([
        { reached: 20, comments: 4 },
        { reached: 0, comments: 0 },
      ]);

      expect(analyzeDiscussion(lessons).flaggedLessonIds).not.toContain(
        lessons[1].lessonId
      );
    });

    it("handles a course with no lessons at all", () => {
      expect(analyzeDiscussion([])).toEqual({
        medianRate: 0,
        flaggedLessonIds: [],
        hasComments: false,
      });
    });
  });

  describe("getDropOffSample", () => {
    it("reports nothing to measure for a course with no students", () => {
      expect(getDropOffSample(base.course.id)).toEqual({
        mature: 0,
        excludedAsRecent: 0,
      });
    });

    it("splits students into the ones that count and the ones excluded as too recent", () => {
      createMatureStudent("Mature One", base.course.id);
      createMatureStudent("Mature Two", base.course.id);
      enrollRecent({
        userId: createStudent("Recent One").id,
        courseId: base.course.id,
      });

      expect(getDropOffSample(base.course.id)).toEqual({
        mature: 2,
        excludedAsRecent: 1,
      });
    });

    it("excludes everyone on a course whose students all arrived this month", () => {
      enrollRecent({ userId: base.user.id, courseId: base.course.id });
      enrollRecent({
        userId: createStudent("Also New").id,
        courseId: base.course.id,
      });

      expect(getDropOffSample(base.course.id)).toEqual({
        mature: 0,
        excludedAsRecent: 2,
      });
    });

    it("does not count another course's students", () => {
      const otherCourse = createOtherCourse();
      createMatureStudent("Mine", base.course.id);
      createMatureStudent("Theirs", otherCourse.id);

      expect(getDropOffSample(base.course.id).mature).toBe(1);
    });
  });

  describe("findWorstDropOff", () => {
    function curve(reached: number[]): LessonReach[] {
      return reached.map((count, index) => ({
        lessonId: (index + 1) * 10,
        title: `Lesson ${index + 1}`,
        modulePosition: 1,
        lessonPosition: index + 1,
        reached: count,
        completed: count,
      }));
    }

    it("returns nothing for a course with no lessons", () => {
      expect(findWorstDropOff([])).toBeNull();
    });

    it("returns nothing for a course with a single lesson", () => {
      // With nothing to fall to, there is no drop-off to name.
      expect(findWorstDropOff(curve([40]))).toBeNull();
    });

    it("returns nothing when the curve never falls", () => {
      expect(findWorstDropOff(curve([0, 0, 0]))).toBeNull();
      expect(findWorstDropOff(curve([30, 30, 30]))).toBeNull();
    });

    it("finds the largest fall between consecutive lessons", () => {
      const worst = findWorstDropOff(curve([50, 46, 44, 22, 20]));

      expect(worst).toMatchObject({
        title: "Lesson 3",
        order: 3,
        reached: 44,
        dropped: 22,
        nextTitle: "Lesson 4",
      });
    });

    it("names the lesson students stop at and the one they never reach", () => {
      const lessons = curve([40, 12]);
      const worst = findWorstDropOff(lessons);

      expect(worst).toMatchObject({
        lessonId: lessons[0].lessonId,
        nextLessonId: lessons[1].lessonId,
      });
    });

    it("expresses the fall as a share of the students who reached that lesson", () => {
      // 30 reach lesson 1, 23 of them go on: 7 stop, which is 23%.
      expect(findWorstDropOff(curve([30, 23]))).toMatchObject({
        order: 1,
        dropped: 7,
        percentage: 23,
      });
    });

    it("measures the largest absolute fall, not the steepest proportional one", () => {
      // Lesson 1 loses 30 of its 100 students; lesson 9 loses 3 of its 4, a
      // far steeper proportion of a far smaller group. The bigger fall is the
      // one worth an instructor's attention.
      expect(
        findWorstDropOff(curve([100, 70, 60, 50, 40, 30, 20, 10, 4, 1]))
      ).toMatchObject({
        order: 1,
        dropped: 30,
      });
    });

    it("gives a tie to the earlier lesson", () => {
      // Everything after the first cliff is downstream of it.
      expect(findWorstDropOff(curve([40, 30, 25, 15]))).toMatchObject({
        order: 1,
        dropped: 10,
      });
    });

    it("withholds the verdict when too few students reached the lesson", () => {
      const worst = findWorstDropOff(
        curve([VERDICT_MIN_STUDENTS - 1, 2])
      );

      expect(worst).toMatchObject({ dropped: 17, meetsThreshold: false });
    });

    it("states the verdict once the threshold is exactly met", () => {
      const worst = findWorstDropOff(curve([VERDICT_MIN_STUDENTS, 2]));

      expect(worst?.meetsThreshold).toBe(true);
    });

    it("gates on the lesson it names rather than on the course as a whole", () => {
      // The course is large enough — 25 students started it — but the cliff
      // sits deep enough in that only 19 students had reached it, so the
      // claim is withheld even though an earlier lesson could have carried one.
      expect(findWorstDropOff(curve([25, 24, 8, 7]))).toMatchObject({
        order: 2,
        reached: 24,
        meetsThreshold: true,
      });
      expect(findWorstDropOff(curve([25, 24, 23, 22, 21, 19, 4]))).toMatchObject(
        { order: 6, reached: 19, meetsThreshold: false }
      );
    });
  });

  describe("getWorstDropOff", () => {
    function threeLessonCourse() {
      const module = createModule({
        courseId: base.course.id,
        title: "Module One",
        position: 1,
      });
      return [1, 2, 3].map((position) =>
        createLesson({
          moduleId: module.id,
          title: `Lesson ${position}`,
          position,
        })
      );
    }

    it("returns nothing for a course nobody has started", () => {
      threeLessonCourse();

      expect(getWorstDropOff(base.course.id)).toBeNull();
    });

    it("identifies the lesson the course loses most students at", () => {
      const lessons = threeLessonCourse();

      // Everyone opens lesson 1, most go on to lesson 2, and lesson 2 is the
      // cliff: only one of the four who reach it continues.
      const students = [
        createMatureStudent("A", base.course.id),
        createMatureStudent("B", base.course.id),
        createMatureStudent("C", base.course.id),
        createMatureStudent("D", base.course.id),
        createMatureStudent("E", base.course.id),
      ];

      for (const student of students) {
        complete({ userId: student.id, lessonId: lessons[0].id });
      }
      for (const student of students.slice(0, 4)) {
        reach({ userId: student.id, lessonId: lessons[1].id });
      }
      reach({ userId: students[0].id, lessonId: lessons[2].id });

      expect(getWorstDropOff(base.course.id)).toMatchObject({
        lessonId: lessons[1].id,
        title: "Lesson 2",
        order: 2,
        reached: 4,
        dropped: 3,
        percentage: 75,
        nextLessonId: lessons[2].id,
        meetsThreshold: false,
      });
    });

    it("clears the threshold once enough students have reached the cliff", () => {
      const lessons = threeLessonCourse();

      // The course grid only states a claim above the threshold, so the read it
      // calls has to say when the claim is earned.
      const students = Array.from({ length: VERDICT_MIN_STUDENTS }, (_, i) =>
        createMatureStudent(`Student ${i}`, base.course.id)
      );

      for (const student of students) {
        complete({ userId: student.id, lessonId: lessons[0].id });
        complete({ userId: student.id, lessonId: lessons[1].id });
      }
      for (const student of students.slice(0, 5)) {
        reach({ userId: student.id, lessonId: lessons[2].id });
      }

      expect(getWorstDropOff(base.course.id)).toMatchObject({
        lessonId: lessons[1].id,
        order: 2,
        reached: VERDICT_MIN_STUDENTS,
        dropped: VERDICT_MIN_STUDENTS - 5,
        percentage: 75,
        meetsThreshold: true,
      });
    });

    it("ignores students who are too recent to have dropped out", () => {
      const lessons = threeLessonCourse();

      // A wave of new students who have only opened lesson 1 would otherwise
      // read as a cliff between lessons 1 and 2 that does not exist.
      for (let i = 0; i < 10; i++) {
        const student = createStudent(`Newcomer ${i}`);
        enrollRecent({ userId: student.id, courseId: base.course.id });
        reach({ userId: student.id, lessonId: lessons[0].id });
      }

      const mature = createMatureStudent("Steady", base.course.id);
      for (const lesson of lessons) {
        complete({ userId: mature.id, lessonId: lesson.id });
      }

      expect(getWorstDropOff(base.course.id)).toBeNull();
    });
  });
  describe("listAnalyticsCourses", () => {
    it("gives an instructor their own courses and nobody else's", () => {
      const mine = createCourse({
        title: "Advanced Testing",
        instructorId: base.instructor.id,
      });
      createCourse({
        title: "Someone Else's Course",
        instructorId: createInstructor("Rival").id,
      });

      const courses = listAnalyticsCourses({
        userId: base.instructor.id,
        role: schema.UserRole.Instructor,
      });

      expect(courses.map((course) => course.title)).toEqual([
        mine.title,
        base.course.title,
      ]);
    });

    it("gives an admin every course, so they can support any instructor", () => {
      const theirs = createCourse({
        title: "Another Instructor's Course",
        instructorId: createInstructor("Rival").id,
      });
      const admin = createAdmin("Platform Admin");

      const courses = listAnalyticsCourses({
        userId: admin.id,
        role: schema.UserRole.Admin,
      });

      expect(courses.map((course) => course.id).sort()).toEqual(
        [base.course.id, theirs.id].sort()
      );
    });

    it("gives a student nothing — the picker is not a way to enumerate courses", () => {
      expect(
        listAnalyticsCourses({
          userId: base.user.id,
          role: schema.UserRole.Student,
        })
      ).toEqual([]);
    });

    it("gives an instructor with no courses an empty list", () => {
      const newcomer = createInstructor("Newly Hired");

      expect(
        listAnalyticsCourses({
          userId: newcomer.id,
          role: schema.UserRole.Instructor,
        })
      ).toEqual([]);
    });
  });

  describe("getPooledProgressDistribution", () => {
    it("returns an empty distribution when there are no courses", () => {
      const pooled = getPooledProgressDistribution([]);

      expect(pooled.totalStudents).toBe(0);
      expect(pooled.completed).toBe(0);
      expect(pooled.bands.map((band) => band.students)).toEqual([
        0, 0, 0, 0, 0, 0,
      ]);
    });

    it("pools bands as proportions of each student's own course", () => {
      // Two students half way through, but through courses of different
      // lengths. Bands are course-relative, so both belong in the same band and
      // neither course's length distorts the other.
      const longLessons = createLessons({ courseId: base.course.id, count: 4 });
      studentWhoCompleted({
        name: "Half Of Four",
        courseId: base.course.id,
        lessons: longLessons,
        completedLessons: 2,
      });

      const shortCourse = createOtherCourse();
      const shortLessons = createLessons({ courseId: shortCourse.id, count: 2 });
      studentWhoCompleted({
        name: "Half Of Two",
        courseId: shortCourse.id,
        lessons: shortLessons,
        completedLessons: 1,
      });

      const pooled = getPooledProgressDistribution([
        base.course.id,
        shortCourse.id,
      ]);

      expect(pooled.totalStudents).toBe(2);
      expect(
        pooled.bands.find((band) => band.key === "26-50")?.students
      ).toBe(2);
    });

    it("counts a student enrolled in two courses once per course", () => {
      // They are at two different points, so they are two rows. Deduplicating
      // them would mean asking which of the two points is the real one.
      const otherCourse = createOtherCourse();
      const lessons = createLessons({ courseId: base.course.id, count: 2 });
      createLessons({ courseId: otherCourse.id, count: 2 });

      const student = createStudent("Doubly Enrolled");
      enroll(student.id, base.course.id);
      enroll(student.id, otherCourse.id);
      complete({ userId: student.id, lessonId: lessons[0].id });
      complete({ userId: student.id, lessonId: lessons[1].id });

      const pooled = getPooledProgressDistribution([
        base.course.id,
        otherCourse.id,
      ]);

      expect(pooled.totalStudents).toBe(2);
      expect(pooled.completed).toBe(1);
      expect(pooled.neverStarted).toBe(1);
    });

    it("yields a completion rate pooled from the 100% band, not averaged across courses", () => {
      // A tiny course where everybody finished, next to a large one where
      // nobody did. Averaging the two rates would call this 50% and let two
      // students outweigh eight; the pooled band says 2 of 10.
      const smallLessons = createLessons({ courseId: base.course.id, count: 2 });
      for (const name of ["Finisher A", "Finisher B"]) {
        studentWhoCompleted({
          name,
          courseId: base.course.id,
          lessons: smallLessons,
          completedLessons: 2,
        });
      }

      const bigCourse = createOtherCourse();
      const bigLessons = createLessons({ courseId: bigCourse.id, count: 2 });
      for (let i = 0; i < 8; i++) {
        studentWhoCompleted({
          name: `Stalled ${i}`,
          courseId: bigCourse.id,
          lessons: bigLessons,
          completedLessons: 0,
        });
      }

      expect(getCompletionSummary(base.course.id).rate).toBe(100);
      expect(getCompletionSummary(bigCourse.id).rate).toBe(0);

      const pooled = summarizeCompletion(
        getPooledProgressDistribution([base.course.id, bigCourse.id])
      );

      expect(pooled).toEqual({ enrolled: 10, completed: 2, rate: 20 });
    });
  });

  describe("getPooledRevenueSummary", () => {
    it("is all zeroes with no courses", () => {
      expect(getPooledRevenueSummary([])).toEqual({
        grossCollected: 0,
        saleCount: 0,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
    });

    it("sums money, sales, and seats across courses", () => {
      const otherCourse = createOtherCourse();

      purchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 3000,
      });
      teamPurchase({
        buyerId: createStudent("Team Buyer").id,
        courseId: otherCourse.id,
        pricePaid: 9000,
        seats: 4,
        redeemedBy: [createStudent("Seat Taker").id],
      });

      expect(
        getPooledRevenueSummary([base.course.id, otherCourse.id])
      ).toEqual({
        grossCollected: 12000,
        saleCount: 2,
        seatsSold: 4,
        seatsRedeemed: 1,
      });
    });
  });

  describe("getPooledDropOffSample", () => {
    it("sums the maturity adjustment across courses", () => {
      const otherCourse = createOtherCourse();

      createMatureStudent("Settled", base.course.id);
      enrollRecent({
        userId: createStudent("Just Arrived").id,
        courseId: base.course.id,
      });
      createMatureStudent("Settled Elsewhere", otherCourse.id);

      expect(
        getPooledDropOffSample([base.course.id, otherCourse.id])
      ).toEqual({ mature: 2, excludedAsRecent: 1 });
    });

    it("is empty with no courses", () => {
      expect(getPooledDropOffSample([])).toEqual({
        mature: 0,
        excludedAsRecent: 0,
      });
    });
  });

  describe("getCourseOverviewRows", () => {
    function courseWithCliff(opts: {
      courseId: number;
      students: number;
      reachSecond: number;
    }) {
      const lessons = createLessons({ courseId: opts.courseId, count: 2 });

      for (let i = 0; i < opts.students; i++) {
        const student = createMatureStudent(
          `Course ${opts.courseId} Student ${i}`,
          opts.courseId
        );
        complete({ userId: student.id, lessonId: lessons[0].id });
        if (i < opts.reachSecond) {
          reach({ userId: student.id, lessonId: lessons[1].id });
        }
      }

      return lessons;
    }

    it("names the worst drop-off on a course above the threshold", () => {
      courseWithCliff({
        courseId: base.course.id,
        students: VERDICT_MIN_STUDENTS,
        reachSecond: 5,
      });

      const [row] = getCourseOverviewRows([
        { id: base.course.id, title: base.course.title, slug: base.course.slug },
      ]);

      expect(row.students).toBe(VERDICT_MIN_STUDENTS);
      expect(row.worstDropOff).toMatchObject({
        order: 1,
        reached: VERDICT_MIN_STUDENTS,
        dropped: VERDICT_MIN_STUDENTS - 5,
        meetsThreshold: true,
      });
    });

    it("withholds the claim on a course below the threshold, per course", () => {
      // The gate is evaluated per course even when courses are read together,
      // so a small course cannot borrow its neighbour's evidence.
      courseWithCliff({
        courseId: base.course.id,
        students: VERDICT_MIN_STUDENTS,
        reachSecond: 5,
      });
      const smallCourse = createOtherCourse();
      courseWithCliff({
        courseId: smallCourse.id,
        students: 3,
        reachSecond: 1,
      });

      const rows = getCourseOverviewRows([
        { id: base.course.id, title: base.course.title, slug: base.course.slug },
        { id: smallCourse.id, title: smallCourse.title, slug: smallCourse.slug },
      ]);

      expect(rows[0].worstDropOff?.meetsThreshold).toBe(true);
      expect(rows[1].worstDropOff).toMatchObject({
        reached: 3,
        meetsThreshold: false,
      });
    });

    it("has nothing to say about a course with no students", () => {
      createLessons({ courseId: base.course.id, count: 3 });

      const [row] = getCourseOverviewRows([
        { id: base.course.id, title: base.course.title, slug: base.course.slug },
      ]);

      expect(row).toMatchObject({ students: 0, worstDropOff: null });
    });

    it("returns one row per course, in the order it was given them", () => {
      const otherCourse = createOtherCourse();

      const rows = getCourseOverviewRows([
        { id: otherCourse.id, title: otherCourse.title, slug: otherCourse.slug },
        { id: base.course.id, title: base.course.title, slug: base.course.slug },
      ]);

      expect(rows.map((row) => row.id)).toEqual([
        otherCourse.id,
        base.course.id,
      ]);
    });
  });
});
