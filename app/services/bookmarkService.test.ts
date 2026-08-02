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
  getBookmarkedLessonIds,
  isLessonBookmarked,
  toggleBookmark,
} from "./bookmarkService";

/** Creates a module + lesson under the given course. */
function createLesson(opts: { courseId: number; title: string }) {
  const mod = testDb
    .insert(schema.modules)
    .values({
      courseId: opts.courseId,
      title: `${opts.title} module`,
      position: 1,
    })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: opts.title, position: 1 })
    .returning()
    .get();
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
});

describe("toggleBookmark", () => {
  it("creates a bookmark when none exists", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });

    const result = toggleBookmark({
      userId: base.user.id,
      lessonId: lesson.id,
    });

    expect(result).toEqual({ bookmarked: true });
    expect(
      isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
    ).toBe(true);
  });

  it("removes the bookmark on a second toggle", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });
    toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

    const result = toggleBookmark({
      userId: base.user.id,
      lessonId: lesson.id,
    });

    expect(result).toEqual({ bookmarked: false });
    expect(
      isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
    ).toBe(false);
  });

  it("never leaves more than one row for a user/lesson pair", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });

    toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
    toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
    toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

    const rows = testDb.select().from(schema.lessonBookmarks).all();
    expect(rows).toHaveLength(1);
  });

  it("keeps bookmarks private to each user", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });

    toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

    expect(
      isLessonBookmarked({ userId: base.instructor.id, lessonId: lesson.id })
    ).toBe(false);
  });
});

describe("isLessonBookmarked", () => {
  it("returns false for a lesson that was never bookmarked", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });

    expect(
      isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
    ).toBe(false);
  });
});

describe("getBookmarkedLessonIds", () => {
  it("returns every bookmarked lesson in the course", () => {
    const first = createLesson({ courseId: base.course.id, title: "One" });
    const second = createLesson({ courseId: base.course.id, title: "Two" });
    const unbookmarked = createLesson({
      courseId: base.course.id,
      title: "Three",
    });

    toggleBookmark({ userId: base.user.id, lessonId: first.id });
    toggleBookmark({ userId: base.user.id, lessonId: second.id });

    const ids = getBookmarkedLessonIds({
      userId: base.user.id,
      courseId: base.course.id,
    });

    expect(ids.sort()).toEqual([first.id, second.id].sort());
    expect(ids).not.toContain(unbookmarked.id);
  });

  it("excludes bookmarks from other courses", () => {
    const otherCourse = testDb
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

    const inCourse = createLesson({ courseId: base.course.id, title: "Mine" });
    const elsewhere = createLesson({
      courseId: otherCourse.id,
      title: "Theirs",
    });

    toggleBookmark({ userId: base.user.id, lessonId: inCourse.id });
    toggleBookmark({ userId: base.user.id, lessonId: elsewhere.id });

    expect(
      getBookmarkedLessonIds({
        userId: base.user.id,
        courseId: base.course.id,
      })
    ).toEqual([inCourse.id]);
  });

  it("excludes other users' bookmarks", () => {
    const lesson = createLesson({ courseId: base.course.id, title: "Intro" });
    toggleBookmark({ userId: base.instructor.id, lessonId: lesson.id });

    expect(
      getBookmarkedLessonIds({
        userId: base.user.id,
        courseId: base.course.id,
      })
    ).toEqual([]);
  });

  it("returns an empty array when the student has no bookmarks", () => {
    createLesson({ courseId: base.course.id, title: "Intro" });

    expect(
      getBookmarkedLessonIds({
        userId: base.user.id,
        courseId: base.course.id,
      })
    ).toEqual([]);
  });
});
