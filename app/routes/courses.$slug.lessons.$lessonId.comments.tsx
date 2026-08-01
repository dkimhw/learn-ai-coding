import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.lessons.$lessonId.comments";
import { UserRole } from "~/db/schema";
import { resolveCountry } from "~/lib/country.server";
import { renderCommentMarkdown } from "~/lib/markdown.server";
import { checkPppAccess } from "~/lib/ppp";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData, parseParams } from "~/lib/validation";
import {
  MAX_COMMENT_LENGTH,
  canModifyComment,
  canViewComments,
  createComment,
  getCommentById,
  softDeleteComment,
  updateComment,
} from "~/services/commentService";
import { getCourseBySlug } from "~/services/courseService";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { findPurchase } from "~/services/purchaseService";
import { getUserById } from "~/services/userService";

// ─── Comments Resource Route ───
// Mutations only — reads come from the lesson loader so the discussion is
// server-rendered with the page. Routing these through the lesson action would
// re-run the quiz fetch, the PPP check, and the progress writes on every
// three-line comment.
//
// Every authorization check is re-run here from scratch rather than trusting
// the page that rendered the form.

const commentsParamsSchema = z.object({
  slug: z.string().min(1),
  lessonId: z.coerce.number().int(),
});

const bodySchema = z
  .string()
  .trim()
  .min(1, "Comment cannot be empty")
  .max(
    MAX_COMMENT_LENGTH,
    `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`
  );

const commentIdSchema = z.coerce.number().int().positive();

/** Absent or empty parentId means "top-level", not "comment zero". */
const parentIdSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  commentIdSchema.optional()
);

const commentActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    body: bodySchema,
    parentId: parentIdSchema,
  }),
  z.object({
    intent: z.literal("edit"),
    commentId: commentIdSchema,
    body: bodySchema,
  }),
  z.object({
    intent: z.literal("delete"),
    commentId: commentIdSchema,
  }),
  z.object({
    intent: z.literal("preview"),
    body: z.string().max(MAX_COMMENT_LENGTH),
  }),
]);

/**
 * Resolves the lesson and the caller's standing on it, throwing the appropriate
 * response when either the lesson or the caller's access does not check out.
 */
async function requireCommentAccess(
  request: Request,
  params: Route.ActionArgs["params"]
) {
  const { slug, lessonId } = parseParams(params, commentsParamsSchema);

  const course = getCourseBySlug(slug);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod || mod.courseId !== course.id) {
    throw data("Lesson not found in this course", { status: 404 });
  }

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (!user) {
    throw data("You must be logged in", { status: 401 });
  }

  const isAdmin = user.role === UserRole.Admin;
  const isCourseInstructor = course.instructorId === user.id;
  const enrolled = isUserEnrolled(user.id, course.id);

  // Comments are content, so the PPP content block applies to them too.
  let pppBlocked = false;
  if (enrolled) {
    const purchase = findPurchase(user.id, course.id);
    const currentCountry = await resolveCountry(request);
    pppBlocked = checkPppAccess(
      course.price,
      course.pppEnabled,
      purchase?.country ?? null,
      currentCountry
    ).blocked;
  }

  if (!canViewComments(enrolled, isCourseInstructor, isAdmin, pppBlocked)) {
    throw data("You do not have access to this discussion", { status: 403 });
  }

  return { course, lesson, user, isCourseInstructor, isAdmin };
}

/** Loads a comment on this lesson and checks the caller may perform `action`. */
function requireModifiableComment(
  commentId: number,
  lessonId: number,
  userId: number,
  isCourseInstructor: boolean,
  isAdmin: boolean,
  action: "edit" | "delete"
) {
  const comment = getCommentById(commentId);
  if (!comment || comment.lessonId !== lessonId) {
    throw data("Comment not found", { status: 404 });
  }

  if (
    !canModifyComment(
      action,
      comment.userId,
      userId,
      isCourseInstructor,
      isAdmin
    )
  ) {
    throw data("You cannot modify this comment", { status: 403 });
  }

  return comment;
}

export async function action({ params, request }: Route.ActionArgs) {
  const { lesson, user, isCourseInstructor, isAdmin } =
    await requireCommentAccess(request, params);

  const formData = await request.formData();
  const parsed = parseFormData(formData, commentActionSchema);

  if (!parsed.success) {
    return data({ error: Object.values(parsed.errors)[0] ?? "Invalid input" }, {
      status: 400,
    });
  }

  const input = parsed.data;

  // Preview reuses the exact render path a stored comment will use — a
  // client-side preview using a different renderer can disagree with the
  // server, and a lying preview is worse than none.
  if (input.intent === "preview") {
    const trimmed = input.body.trim();
    return {
      html: trimmed ? await renderCommentMarkdown(trimmed) : null,
    };
  }

  if (input.intent === "create") {
    try {
      createComment(
        lesson.id,
        user.id,
        input.body,
        input.parentId ?? null
      );
    } catch (error) {
      return data(
        { error: error instanceof Error ? error.message : "Invalid comment" },
        { status: 400 }
      );
    }
    return { ok: true };
  }

  if (input.intent === "edit") {
    requireModifiableComment(
      input.commentId,
      lesson.id,
      user.id,
      isCourseInstructor,
      isAdmin,
      "edit"
    );

    try {
      updateComment(input.commentId, input.body);
    } catch (error) {
      return data(
        { error: error instanceof Error ? error.message : "Invalid comment" },
        { status: 400 }
      );
    }
    return { ok: true };
  }

  requireModifiableComment(
    input.commentId,
    lesson.id,
    user.id,
    isCourseInstructor,
    isAdmin,
    "delete"
  );
  softDeleteComment(input.commentId);
  return { ok: true };
}
