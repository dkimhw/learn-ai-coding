import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Private per-student lesson bookmarks. A bookmark is just the presence of a
// row, so the toggle inserts or deletes rather than flipping a flag.

/**
 * Flips the bookmark for one lesson and reports the resulting state.
 * Returns `{ bookmarked: true }` when a bookmark was created.
 */
export function toggleBookmark(opts: { userId: number; lessonId: number }) {
  const existing = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();

  if (existing) {
    db.delete(lessonBookmarks).where(eq(lessonBookmarks.id, existing.id)).run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks)
    .values({ userId: opts.userId, lessonId: opts.lessonId })
    .run();

  return { bookmarked: true };
}

export function isLessonBookmarked(opts: {
  userId: number;
  lessonId: number;
}): boolean {
  const existing = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();

  return !!existing;
}

/**
 * Every lesson the student has bookmarked within one course. Loaders call this
 * once and hand the result down as a Set, so lesson lists never query per-row.
 */
export function getBookmarkedLessonIds(opts: {
  userId: number;
  courseId: number;
}): number[] {
  return db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(modules.courseId, opts.courseId)
      )
    )
    .all()
    .map((row) => row.lessonId);
}
