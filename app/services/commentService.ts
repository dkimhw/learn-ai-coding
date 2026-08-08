import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  lessonComments,
  lessons,
  modules,
  users,
  NotificationType,
  UserRole,
} from "~/db/schema";
import { createNotification } from "~/services/notificationService";

// ─── Comment Service ───
// Per-lesson discussion: top-level comments with one level of replies.
// Deletes are soft — a deleted comment with replies survives as a tombstone so
// the thread stays intact; one with no replies disappears entirely.
// Uses positional parameters (project convention).

/** Default page size for top-level comments. The loader passes nothing today. */
export const DEFAULT_COMMENT_LIMIT = 100;

/** Maximum comment body length, enforced at both boundaries. */
export const MAX_COMMENT_LENGTH = 5000;

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type Comment = {
  id: number;
  lessonId: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** True when the comment is a soft-deleted tombstone kept for thread shape. */
  deleted: boolean;
  author: CommentAuthor;
};

export type CommentThread = Comment & { replies: Comment[] };

// ─── Authorization predicates ───
// These live here rather than in the route so they can be unit-tested; the
// route parses, calls a predicate, and turns `false` into a 403.

/**
 * Read and write on a lesson's discussion are gated identically: enrolled
 * students, the course instructor (instructors do not enroll in their own
 * courses), and admins may participate. PPP-blocked users are treated as
 * blocked — comments are content, so the same block applies.
 */
export function canViewComments(
  enrolled: boolean,
  isCourseInstructor: boolean,
  isAdmin: boolean,
  pppBlocked: boolean
): boolean {
  if (pppBlocked) return false;
  return enrolled || isCourseInstructor || isAdmin;
}

export type CommentAction = "edit" | "delete";

/**
 * Edits belong to the author alone. Deletes are also available to the course
 * instructor and to admins — the instructor's delete power is the moderation
 * story at this scale.
 */
export function canModifyComment(
  action: CommentAction,
  authorId: number,
  userId: number,
  isCourseInstructor: boolean,
  isAdmin: boolean
): boolean {
  if (authorId === userId) return true;
  if (action === "delete") return isCourseInstructor || isAdmin;
  return false;
}

// ─── Reads ───

const commentColumns = {
  id: lessonComments.id,
  lessonId: lessonComments.lessonId,
  parentId: lessonComments.parentId,
  body: lessonComments.body,
  createdAt: lessonComments.createdAt,
  editedAt: lessonComments.editedAt,
  deletedAt: lessonComments.deletedAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
  authorRole: users.role,
};

type CommentRow = {
  id: number;
  lessonId: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: UserRole;
};

/** Shapes a joined row into a Comment, blanking the body of a tombstone. */
function toComment(row: CommentRow): Comment {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    lessonId: row.lessonId,
    parentId: row.parentId,
    body: deleted ? "" : row.body,
    createdAt: row.createdAt,
    editedAt: deleted ? null : row.editedAt,
    deleted,
    author: {
      id: row.authorId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
      role: row.authorRole,
    },
  };
}

/** Returns the raw row (including a soft-deleted one) for authorization checks. */
export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get();
}

/**
 * Threads for a lesson: top-level comments newest-first, each with its replies
 * oldest-first (a conversation read backwards is nonsense).
 *
 * Deleted replies are dropped. A deleted top-level comment is dropped too
 * unless it still has surviving replies, in which case it is returned as a
 * tombstone so the thread stays intact.
 *
 * `limit`/`offset` page the top-level comments. Pagination UI is deferred, but
 * the seam is here from day one.
 */
export function getCommentsForLesson(
  lessonId: number,
  limit: number = DEFAULT_COMMENT_LIMIT,
  offset: number = 0
): CommentThread[] {
  const parents = db
    .select(commentColumns)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(eq(lessonComments.lessonId, lessonId), isNull(lessonComments.parentId))
    )
    .orderBy(desc(lessonComments.createdAt), desc(lessonComments.id))
    .limit(limit)
    .offset(offset)
    .all() as CommentRow[];

  if (parents.length === 0) return [];

  const replies = db
    .select(commentColumns)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        inArray(
          lessonComments.parentId,
          parents.map((p) => p.id)
        ),
        isNull(lessonComments.deletedAt)
      )
    )
    .orderBy(asc(lessonComments.createdAt), asc(lessonComments.id))
    .all() as CommentRow[];

  const repliesByParent = new Map<number, Comment[]>();
  for (const row of replies) {
    const bucket = repliesByParent.get(row.parentId!) ?? [];
    bucket.push(toComment(row));
    repliesByParent.set(row.parentId!, bucket);
  }

  const threads: CommentThread[] = [];
  for (const parent of parents) {
    const parentReplies = repliesByParent.get(parent.id) ?? [];
    // A deleted parent only survives as a tombstone for the sake of its replies.
    if (parent.deletedAt !== null && parentReplies.length === 0) continue;
    threads.push({ ...toComment(parent), replies: parentReplies });
  }

  return threads;
}

/** Number of live (non-deleted) comments on a lesson, replies included. */
export function getCommentCountForLesson(lessonId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.deletedAt)
      )
    )
    .get();

  return result?.count ?? 0;
}

// ─── Writes ───

/**
 * Creates a comment, or a reply when `parentId` is given.
 *
 * The "a reply's parent must be top-level" invariant is enforced here rather
 * than in the route: a route-level check is one forgotten call site away from
 * being bypassed, and that is the bug that quietly corrupts the data model.
 * The parent must also belong to the same lesson and must not be deleted.
 */
export function createComment(
  lessonId: number,
  userId: number,
  body: string,
  parentId: number | null
) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment body cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment body cannot exceed ${MAX_COMMENT_LENGTH} characters`
    );
  }

  if (parentId !== null) {
    const parent = getCommentById(parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies cannot be nested more than one level deep");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.deletedAt !== null) {
      throw new Error("Cannot reply to a deleted comment");
    }
  }

  const comment = db
    .insert(lessonComments)
    .values({ lessonId, userId, body: trimmed, parentId })
    .returning()
    .get();

  if (parentId !== null) {
    notifyParentAuthorOfReply({ parentId, replierId: userId, lessonId });
  }

  return comment;
}

/**
 * Tells the author of a comment that someone replied to it.
 *
 * A side effect of replying rather than something callers opt into, for the
 * same reason enrollment notifications are: the resource route is not the only
 * conceivable caller, and a reply nobody hears about is the gap this closes.
 *
 * Silent in the two cases where a notification would be noise or nonsense —
 * replying to yourself, and a parent or lesson that cannot be resolved. Never
 * throws: a comment that was accepted must not fail on its notification.
 */
function notifyParentAuthorOfReply(opts: {
  parentId: number;
  replierId: number;
  lessonId: number;
}) {
  const parent = getCommentById(opts.parentId);
  if (!parent) return;

  // Nobody wants to be told they replied to themselves.
  if (parent.userId === opts.replierId) return;

  const replier = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, opts.replierId))
    .get();
  if (!replier) return;

  // The link has to name the course, which the comment only knows about two
  // joins away.
  const location = db
    .select({ courseSlug: courses.slug })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, opts.lessonId))
    .get();
  if (!location) return;

  createNotification({
    recipientUserId: parent.userId,
    type: NotificationType.CommentReply,
    title: "New Reply",
    message: `${replier.name} replied to your comment`,
    // `#discussion` is the anchor the comments card already carries, so the
    // reply is on screen rather than somewhere below the video.
    linkUrl: `/courses/${location.courseSlug}/lessons/${opts.lessonId}#discussion`,
  });
}

/** Edits a comment's body and stamps `editedAt`. There is no edit time window. */
export function updateComment(id: number, body: string) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment body cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment body cannot exceed ${MAX_COMMENT_LENGTH} characters`
    );
  }

  const existing = getCommentById(id);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.deletedAt !== null) {
    throw new Error("Cannot edit a deleted comment");
  }

  return db
    .update(lessonComments)
    .set({ body: trimmed, editedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}

/**
 * Soft-deletes a comment. The row is retained either way — whether it renders
 * as `[deleted]` or vanishes is decided at read time by whether it still has
 * live replies.
 */
export function softDeleteComment(id: number) {
  const existing = getCommentById(id);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.deletedAt !== null) {
    return existing;
  }

  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}
