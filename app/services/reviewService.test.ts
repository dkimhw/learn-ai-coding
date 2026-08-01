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
  upsertReview,
  getReviewByUserAndCourse,
  getCourseRatingStats,
  getCourseRatingStatsMap,
} from "./reviewService";

/** Creates an extra student for multi-reviewer tests. */
function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

/** Creates an extra course for isolation / batch tests. */
function createCourse(title: string, slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title,
      slug,
      description: "Another course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

describe("reviewService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertReview", () => {
    it("creates a new review", () => {
      const review = upsertReview(base.user.id, base.course.id, 4);

      expect(review).toBeDefined();
      expect(review.userId).toBe(base.user.id);
      expect(review.courseId).toBe(base.course.id);
      expect(review.rating).toBe(4);
      expect(review.createdAt).toBeDefined();
    });

    it("updates the existing review instead of creating a second one", () => {
      upsertReview(base.user.id, base.course.id, 2);
      const updated = upsertReview(base.user.id, base.course.id, 5);

      expect(updated.rating).toBe(5);
      expect(getCourseRatingStats(base.course.id).count).toBe(1);
    });

    it("keeps reviews from different students separate", () => {
      const student2 = createStudent("student2@example.com");
      upsertReview(base.user.id, base.course.id, 3);
      upsertReview(student2.id, base.course.id, 5);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(2);
      expect(stats.average).toBe(4);
    });
  });

  describe("getReviewByUserAndCourse", () => {
    it("returns the review when it exists", () => {
      upsertReview(base.user.id, base.course.id, 3);

      const found = getReviewByUserAndCourse(base.user.id, base.course.id);
      expect(found).toBeDefined();
      expect(found!.rating).toBe(3);
    });

    it("returns undefined when the user has not reviewed the course", () => {
      expect(
        getReviewByUserAndCourse(base.user.id, base.course.id)
      ).toBeUndefined();
    });
  });

  describe("getCourseRatingStats", () => {
    it("returns average and count for a rated course", () => {
      const student2 = createStudent("student2@example.com");
      upsertReview(base.user.id, base.course.id, 4);
      upsertReview(student2.id, base.course.id, 2);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(2);
      expect(stats.average).toBe(3);
    });

    it("returns zeros when the course has no ratings", () => {
      const stats = getCourseRatingStats(base.course.id);
      expect(stats).toEqual({ average: 0, count: 0 });
    });
  });

  describe("getCourseRatingStatsMap", () => {
    it("returns an empty map for an empty input", () => {
      expect(getCourseRatingStatsMap([]).size).toBe(0);
    });

    it("returns stats per course and omits unrated courses", () => {
      const course2 = createCourse("Second Course", "second-course");
      const course3 = createCourse("Third Course", "third-course");
      const student2 = createStudent("student2@example.com");

      upsertReview(base.user.id, base.course.id, 5);
      upsertReview(student2.id, base.course.id, 3);
      upsertReview(base.user.id, course2.id, 4);
      // course3 intentionally left unrated

      const map = getCourseRatingStatsMap([
        base.course.id,
        course2.id,
        course3.id,
      ]);

      expect(map.get(base.course.id)).toEqual({ average: 4, count: 2 });
      expect(map.get(course2.id)).toEqual({ average: 4, count: 1 });
      expect(map.has(course3.id)).toBe(false);
    });
  });
});
