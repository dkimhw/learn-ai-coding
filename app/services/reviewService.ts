import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";

// ─── Review Service ───
// Handles course star ratings (1–5). One review per student per course —
// re-rating updates the existing row (upsert). No written reviews.
// Uses positional parameters (project convention).

export type RatingStats = { average: number; count: number };

export function getReviewByUserAndCourse(userId: number, courseId: number) {
  return db
    .select()
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      )
    )
    .get();
}

/**
 * Creates a rating, or updates the student's existing rating for the course.
 * Rating is expected to be an integer 1–5 (validated at the route layer).
 */
export function upsertReview(userId: number, courseId: number, rating: number) {
  const existing = getReviewByUserAndCourse(userId, courseId);

  if (existing) {
    return db
      .update(courseReviews)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseReviews.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseReviews)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

/**
 * Average rating and number of ratings for a single course.
 * Returns { average: 0, count: 0 } when the course has no ratings.
 */
export function getCourseRatingStats(courseId: number): RatingStats {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return { average: result?.average ?? 0, count: result?.count ?? 0 };
}

/**
 * Batch version of getCourseRatingStats for list pages (avoids N+1 queries).
 * Returns a Map keyed by courseId; courses with no ratings are simply absent.
 */
export function getCourseRatingStatsMap(
  courseIds: number[]
): Map<number, RatingStats> {
  const map = new Map<number, RatingStats>();
  if (courseIds.length === 0) return map;

  const rows = db
    .select({
      courseId: courseReviews.courseId,
      average: sql<number>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  for (const row of rows) {
    map.set(row.courseId, { average: row.average ?? 0, count: row.count });
  }

  return map;
}
