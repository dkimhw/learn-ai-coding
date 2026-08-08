import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { db } from "~/db";
import {
  enrollments,
  courses,
  modules,
  lessons,
  lessonProgress,
  users,
  LessonProgressStatus,
  NotificationType,
} from "~/db/schema";
import { createNotification } from "~/services/notificationService";

// ─── Enrollment Service ───
// Handles enrollment, unenrollment, duplicate prevention, and enrollment validation.
// Uses positional parameters (project convention).

export function getEnrollmentById(id: number) {
  return db.select().from(enrollments).where(eq(enrollments.id, id)).get();
}

export function getEnrollmentsByUser(userId: number) {
  return db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .all();
}

export function getEnrollmentsByCourse(courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .all();
}

export function getEnrollmentCountForCourse(courseId: number) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  return result?.count ?? 0;
}

export function findEnrollment(userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

export function isUserEnrolled(userId: number, courseId: number) {
  return !!findEnrollment(userId, courseId);
}

export function enrollUser(
  userId: number,
  courseId: number,
  sendEmail: boolean,
  skipValidation: boolean
) {
  if (!skipValidation) {
    // Check if already enrolled
    const existing = findEnrollment(userId, courseId);
    if (existing) {
      throw new Error("User is already enrolled in this course");
    }

    // Check that the course exists
    const course = db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .get();
    if (!course) {
      throw new Error("Course not found");
    }
  }

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId })
    .returning()
    .get();

  notifyInstructorOfEnrollment({ userId, courseId });

  // sendEmail parameter accepted but not implemented (no email service — PRD out of scope)
  if (sendEmail) {
    // Would send welcome email here
  }

  return enrollment;
}

/**
 * Tells the course's instructor that a student just enrolled.
 *
 * A side effect of enrolling rather than something the caller opts into: an
 * enrollment the instructor never hears about is the problem this exists to
 * solve, and there is no route that should be allowed to skip it.
 *
 * Silently does nothing when the course or the student cannot be resolved —
 * `enrollUser(…, skipValidation: true)` reaches here without either having been
 * checked, and a missing notification must never fail an enrollment that the
 * database itself accepted.
 */
function notifyInstructorOfEnrollment(opts: {
  userId: number;
  courseId: number;
}) {
  const course = db
    .select({
      id: courses.id,
      title: courses.title,
      instructorId: courses.instructorId,
    })
    .from(courses)
    .where(eq(courses.id, opts.courseId))
    .get();
  if (!course) return;

  const student = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, opts.userId))
    .get();
  if (!student) return;

  createNotification({
    recipientUserId: course.instructorId,
    type: NotificationType.Enrollment,
    title: "New Enrollment",
    message: `${student.name} enrolled in ${course.title}`,
    linkUrl: `/instructor/${course.id}/students`,
  });
}

export function unenrollUser(userId: number, courseId: number) {
  const existing = findEnrollment(userId, courseId);
  if (!existing) {
    throw new Error("User is not enrolled in this course");
  }

  return db
    .delete(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .returning()
    .get();
}

export function markEnrollmentComplete(userId: number, courseId: number) {
  return db
    .update(enrollments)
    .set({ completedAt: new Date().toISOString() })
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .returning()
    .get();
}

// ─── Enrollment completion ───
//
// `enrollments.completedAt` is the one notion of "finished this course" the
// product has: the instructor roster, the student dashboard, and the analytics
// page all read it. It is derived, never entered — a student has completed a
// course when every lesson in it carries a completed progress row for them.
//
// Deriving it on read would be simpler but would mean three pages each
// recomputing the same aggregate; stamping it on write keeps the field as the
// single source of truth those pages already assume it is.

function getCourseLessonIds(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((l) => l.id);
}

function hasCompletedEveryLesson(opts: {
  userId: number;
  lessonIds: number[];
}) {
  // A course with no lessons is not completable — otherwise every enrollment on
  // an empty draft course would stamp complete the moment it was looked at.
  if (opts.lessonIds.length === 0) return false;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, opts.userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, opts.lessonIds)
      )
    )
    .get();

  return (result?.count ?? 0) >= opts.lessonIds.length;
}

/**
 * Stamps `completedAt` on an enrollment if the student has now completed every
 * lesson in the course. Called after any lesson completion.
 *
 * Idempotent in both directions: an enrollment that is already stamped keeps its
 * original timestamp rather than being re-stamped, and an enrollment that does
 * not yet qualify is left alone. Returns the enrollment as it now stands, or
 * undefined if the student is not enrolled.
 */
export function syncEnrollmentCompletion(opts: {
  userId: number;
  courseId: number;
}) {
  const enrollment = findEnrollment(opts.userId, opts.courseId);
  if (!enrollment) return undefined;
  if (enrollment.completedAt) return enrollment;

  const lessonIds = getCourseLessonIds(opts.courseId);
  if (!hasCompletedEveryLesson({ userId: opts.userId, lessonIds })) {
    return enrollment;
  }

  return markEnrollmentComplete(opts.userId, opts.courseId);
}

/**
 * Stamps every existing enrollment that already satisfies the completion
 * condition. Until this ran, `completedAt` was never written by the
 * application, so history students had genuinely earned was invisible.
 *
 * Safe to re-run: already-stamped enrollments are skipped, so the timestamp on
 * a given enrollment is only ever written once.
 */
export function backfillEnrollmentCompletions() {
  const pending = db
    .select({
      userId: enrollments.userId,
      courseId: enrollments.courseId,
    })
    .from(enrollments)
    .where(isNull(enrollments.completedAt))
    .all();

  // Lesson ids are per course, not per enrollment — cache them so a course with
  // 60 students costs one lookup rather than 60.
  const lessonIdsByCourse = new Map<number, number[]>();
  let completed = 0;

  for (const enrollment of pending) {
    let lessonIds = lessonIdsByCourse.get(enrollment.courseId);
    if (!lessonIds) {
      lessonIds = getCourseLessonIds(enrollment.courseId);
      lessonIdsByCourse.set(enrollment.courseId, lessonIds);
    }

    if (!hasCompletedEveryLesson({ userId: enrollment.userId, lessonIds })) {
      continue;
    }

    markEnrollmentComplete(enrollment.userId, enrollment.courseId);
    completed++;
  }

  return { scanned: pending.length, completed };
}

export function getUserEnrolledCourses(userId: number) {
  return db
    .select({
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      courseDescription: courses.description,
      coverImageUrl: courses.coverImageUrl,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(eq(enrollments.userId, userId))
    .all();
}

export function getCourseEnrolledStudents(courseId: number) {
  return db
    .select({
      enrollmentId: enrollments.id,
      userId: enrollments.userId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .all();
}
