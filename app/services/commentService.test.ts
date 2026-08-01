import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  canModifyComment,
  canViewComments,
  createComment,
  getCommentById,
  getCommentCountForLesson,
  getCommentsForLesson,
  softDeleteComment,
  updateComment,
  MAX_COMMENT_LENGTH,
} from "./commentService";

/** Creates a module + lesson so comments have something to hang off. */
function createLesson(title: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: `${title} module`, position: 1 })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position: 1 })
    .returning()
    .get();
}

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = createLesson("Test Lesson");
  });

  describe("canViewComments", () => {
    it("allows an enrolled student", () => {
      expect(canViewComments(true, false, false, false)).toBe(true);
    });

    it("allows the course instructor, who is not enrolled", () => {
      expect(canViewComments(false, true, false, false)).toBe(true);
    });

    it("allows an admin", () => {
      expect(canViewComments(false, false, true, false)).toBe(true);
    });

    it("denies a user who is none of those", () => {
      expect(canViewComments(false, false, false, false)).toBe(false);
    });

    it("denies a PPP-blocked user even though they are enrolled", () => {
      expect(canViewComments(true, false, false, true)).toBe(false);
    });

    it("denies a PPP-blocked instructor and admin too", () => {
      expect(canViewComments(false, true, false, true)).toBe(false);
      expect(canViewComments(false, false, true, true)).toBe(false);
    });
  });

  describe("canModifyComment", () => {
    const author = 1;
    const other = 2;

    it("lets the author edit and delete their own comment", () => {
      expect(canModifyComment("edit", author, author, false, false)).toBe(true);
      expect(canModifyComment("delete", author, author, false, false)).toBe(
        true
      );
    });

    it("does not let a non-author edit, even the instructor or an admin", () => {
      expect(canModifyComment("edit", author, other, false, false)).toBe(false);
      expect(canModifyComment("edit", author, other, true, false)).toBe(false);
      expect(canModifyComment("edit", author, other, false, true)).toBe(false);
    });

    it("lets the course instructor and an admin delete anyone's comment", () => {
      expect(canModifyComment("delete", author, other, true, false)).toBe(true);
      expect(canModifyComment("delete", author, other, false, true)).toBe(true);
    });

    it("does not let an unrelated user delete someone else's comment", () => {
      expect(canModifyComment("delete", author, other, false, false)).toBe(
        false
      );
    });
  });

  describe("createComment", () => {
    it("creates a top-level comment", () => {
      const comment = createComment(lesson.id, base.user.id, "Hello", null);

      expect(comment.lessonId).toBe(lesson.id);
      expect(comment.userId).toBe(base.user.id);
      expect(comment.parentId).toBeNull();
      expect(comment.body).toBe("Hello");
      expect(comment.editedAt).toBeNull();
      expect(comment.deletedAt).toBeNull();
    });

    it("trims the body before storing", () => {
      const comment = createComment(
        lesson.id,
        base.user.id,
        "  padded  ",
        null
      );
      expect(comment.body).toBe("padded");
    });

    it("rejects a body that is empty after trimming", () => {
      expect(() =>
        createComment(lesson.id, base.user.id, "   \n  ", null)
      ).toThrow(/empty/i);
    });

    it("rejects a body longer than the maximum", () => {
      expect(() =>
        createComment(
          lesson.id,
          base.user.id,
          "x".repeat(MAX_COMMENT_LENGTH + 1),
          null
        )
      ).toThrow(/exceed/i);
    });

    it("accepts a body exactly at the maximum", () => {
      const comment = createComment(
        lesson.id,
        base.user.id,
        "x".repeat(MAX_COMMENT_LENGTH),
        null
      );
      expect(comment.body).toHaveLength(MAX_COMMENT_LENGTH);
    });

    it("creates a reply to a top-level comment", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const reply = createComment(
        lesson.id,
        base.instructor.id,
        "Answer",
        parent.id
      );

      expect(reply.parentId).toBe(parent.id);
    });

    it("refuses to nest a reply under another reply", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const reply = createComment(
        lesson.id,
        base.instructor.id,
        "Answer",
        parent.id
      );

      expect(() =>
        createComment(lesson.id, base.user.id, "Nested", reply.id)
      ).toThrow(/nested/i);
    });

    it("refuses a parent belonging to a different lesson", () => {
      const otherLesson = createLesson("Other Lesson");
      const parent = createComment(lesson.id, base.user.id, "Question", null);

      expect(() =>
        createComment(otherLesson.id, base.user.id, "Reply", parent.id)
      ).toThrow(/different lesson/i);
    });

    it("refuses a parent that does not exist", () => {
      expect(() =>
        createComment(lesson.id, base.user.id, "Reply", 9999)
      ).toThrow(/not found/i);
    });

    it("refuses a reply to a deleted comment", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      softDeleteComment(parent.id);

      expect(() =>
        createComment(lesson.id, base.user.id, "Reply", parent.id)
      ).toThrow(/deleted/i);
    });
  });

  describe("updateComment", () => {
    it("replaces the body and stamps editedAt", () => {
      const comment = createComment(lesson.id, base.user.id, "Typo", null);
      const updated = updateComment(comment.id, "  Fixed  ");

      expect(updated.body).toBe("Fixed");
      expect(updated.editedAt).not.toBeNull();
    });

    it("rejects an empty or over-length body", () => {
      const comment = createComment(lesson.id, base.user.id, "Original", null);

      expect(() => updateComment(comment.id, "   ")).toThrow(/empty/i);
      expect(() =>
        updateComment(comment.id, "x".repeat(MAX_COMMENT_LENGTH + 1))
      ).toThrow(/exceed/i);
      expect(getCommentById(comment.id)!.body).toBe("Original");
    });

    it("refuses to edit a deleted comment", () => {
      const comment = createComment(lesson.id, base.user.id, "Original", null);
      softDeleteComment(comment.id);

      expect(() => updateComment(comment.id, "Revived")).toThrow(/deleted/i);
    });
  });

  describe("softDeleteComment", () => {
    it("stamps deletedAt rather than removing the row", () => {
      const comment = createComment(lesson.id, base.user.id, "Bye", null);
      softDeleteComment(comment.id);

      const row = getCommentById(comment.id);
      expect(row).toBeDefined();
      expect(row!.deletedAt).not.toBeNull();
    });

    it("is idempotent", () => {
      const comment = createComment(lesson.id, base.user.id, "Bye", null);
      const first = softDeleteComment(comment.id);
      const second = softDeleteComment(comment.id);

      expect(second.deletedAt).toBe(first.deletedAt);
    });
  });

  describe("getCommentsForLesson", () => {
    it("returns top-level comments newest-first", () => {
      const first = createComment(lesson.id, base.user.id, "First", null);
      const second = createComment(lesson.id, base.user.id, "Second", null);
      const third = createComment(lesson.id, base.user.id, "Third", null);

      const threads = getCommentsForLesson(lesson.id);
      expect(threads.map((t) => t.id)).toEqual([third.id, second.id, first.id]);
    });

    it("returns replies oldest-first within a thread", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const a = createComment(lesson.id, base.user.id, "A", parent.id);
      const b = createComment(lesson.id, base.instructor.id, "B", parent.id);
      const c = createComment(lesson.id, base.user.id, "C", parent.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.replies.map((r) => r.id)).toEqual([a.id, b.id, c.id]);
    });

    it("includes the author with their role, so the instructor badge can render", () => {
      createComment(lesson.id, base.instructor.id, "From the instructor", null);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.author.id).toBe(base.instructor.id);
      expect(thread.author.name).toBe("Test Instructor");
      expect(thread.author.role).toBe(schema.UserRole.Instructor);
    });

    it("omits a deleted comment that has no replies", () => {
      const kept = createComment(lesson.id, base.user.id, "Kept", null);
      const gone = createComment(lesson.id, base.user.id, "Gone", null);
      softDeleteComment(gone.id);

      const threads = getCommentsForLesson(lesson.id);
      expect(threads.map((t) => t.id)).toEqual([kept.id]);
    });

    it("keeps a deleted comment as a tombstone when it has replies", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      createComment(lesson.id, base.instructor.id, "Answer", parent.id);
      softDeleteComment(parent.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.id).toBe(parent.id);
      expect(thread.deleted).toBe(true);
      expect(thread.body).toBe("");
      expect(thread.replies).toHaveLength(1);
    });

    it("drops a tombstone once its last reply is deleted", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const reply = createComment(
        lesson.id,
        base.instructor.id,
        "Answer",
        parent.id
      );
      softDeleteComment(parent.id);
      softDeleteComment(reply.id);

      expect(getCommentsForLesson(lesson.id)).toEqual([]);
    });

    it("excludes deleted replies from a live thread", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const kept = createComment(lesson.id, base.user.id, "Kept", parent.id);
      const gone = createComment(lesson.id, base.user.id, "Gone", parent.id);
      softDeleteComment(gone.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.replies.map((r) => r.id)).toEqual([kept.id]);
    });

    it("does not leak comments from another lesson", () => {
      const otherLesson = createLesson("Other Lesson");
      createComment(lesson.id, base.user.id, "Mine", null);
      createComment(otherLesson.id, base.user.id, "Theirs", null);

      const threads = getCommentsForLesson(lesson.id);
      expect(threads).toHaveLength(1);
      expect(threads[0].body).toBe("Mine");
    });

    it("pages top-level comments with limit and offset", () => {
      const first = createComment(lesson.id, base.user.id, "First", null);
      const second = createComment(lesson.id, base.user.id, "Second", null);
      const third = createComment(lesson.id, base.user.id, "Third", null);

      expect(getCommentsForLesson(lesson.id, 2).map((t) => t.id)).toEqual([
        third.id,
        second.id,
      ]);
      expect(getCommentsForLesson(lesson.id, 2, 2).map((t) => t.id)).toEqual([
        first.id,
      ]);
    });

    it("returns an empty array for a lesson with no comments", () => {
      expect(getCommentsForLesson(lesson.id)).toEqual([]);
    });
  });

  describe("getCommentCountForLesson", () => {
    it("counts top-level comments and replies together", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      createComment(lesson.id, base.instructor.id, "Answer", parent.id);
      createComment(lesson.id, base.user.id, "Another thread", null);

      expect(getCommentCountForLesson(lesson.id)).toBe(3);
    });

    it("excludes deleted comments and deleted replies", () => {
      const parent = createComment(lesson.id, base.user.id, "Question", null);
      const reply = createComment(
        lesson.id,
        base.instructor.id,
        "Answer",
        parent.id
      );
      const solo = createComment(lesson.id, base.user.id, "Solo", null);

      softDeleteComment(reply.id);
      expect(getCommentCountForLesson(lesson.id)).toBe(2);

      softDeleteComment(solo.id);
      expect(getCommentCountForLesson(lesson.id)).toBe(1);
    });

    it("counts comments from every participant", () => {
      const student2 = createStudent("student2@example.com");
      createComment(lesson.id, base.user.id, "One", null);
      createComment(lesson.id, student2.id, "Two", null);

      expect(getCommentCountForLesson(lesson.id)).toBe(2);
    });

    it("returns zero for a lesson with no comments", () => {
      expect(getCommentCountForLesson(lesson.id)).toBe(0);
    });
  });
});
