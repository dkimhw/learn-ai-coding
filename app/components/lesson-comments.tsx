import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsContentNoShift,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";

// ─── Lesson Discussion ───
// Slack-style threading: top-level comments newest-first, one level of replies
// oldest-first. "Reply" on a reply attaches to the same top-level parent and
// prefills @name in the composer.

/** Replies beyond this are hidden behind a "show N more replies" toggle. */
const VISIBLE_REPLIES = 3;

export const MAX_COMMENT_LENGTH = 5000;

export type CommentView = {
  id: number;
  parentId: number | null;
  /** Sanitized HTML. Null for a soft-deleted tombstone. */
  bodyHtml: string | null;
  /** Raw markdown, sent only when the viewer may edit this comment. */
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
  isCourseInstructor: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type CommentThreadView = CommentView & { replies: CommentView[] };

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LessonComments({
  actionUrl,
  threads,
  commentCount,
}: {
  actionUrl: string;
  threads: CommentThreadView[];
  commentCount: number;
}) {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">
            Discussion ({commentCount})
          </h2>
        </div>

        {/* Composer sits at the top, matching newest-first ordering. */}
        <CommentComposer
          actionUrl={actionUrl}
          parentId={null}
          placeholder="Ask a question or share something you learned…"
          submitLabel="Post comment"
        />

        <div className="mt-8 space-y-8">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet. Be the first to start the discussion.
            </p>
          ) : (
            threads.map((thread) => (
              <CommentThread
                key={thread.id}
                actionUrl={actionUrl}
                thread={thread}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CommentThread({
  actionUrl,
  thread,
}: {
  actionUrl: string;
  thread: CommentThreadView;
}) {
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommentView | null>(null);

  const hiddenCount = Math.max(0, thread.replies.length - VISIBLE_REPLIES);
  const visibleReplies =
    showAllReplies || hiddenCount === 0
      ? thread.replies
      : thread.replies.slice(thread.replies.length - VISIBLE_REPLIES);

  // Replying to a reply attaches to the same top-level parent, so every reply
  // box on this thread posts with the parent's id.
  function openReply(target: CommentView) {
    setReplyingTo(target);
    setShowAllReplies(true);
  }

  return (
    <div>
      <CommentItem
        actionUrl={actionUrl}
        comment={thread}
        onReply={() => openReply(thread)}
      />

      {(thread.replies.length > 0 || replyingTo) && (
        <div className="mt-4 space-y-4 border-l-2 border-border pl-4 sm:ml-11">
          {hiddenCount > 0 && !showAllReplies && (
            <button
              type="button"
              onClick={() => setShowAllReplies(true)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Show {hiddenCount} more{" "}
              {hiddenCount === 1 ? "reply" : "replies"}
            </button>
          )}

          {visibleReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              actionUrl={actionUrl}
              comment={reply}
              onReply={() => openReply(reply)}
            />
          ))}

          {replyingTo && (
            <CommentComposer
              actionUrl={actionUrl}
              parentId={thread.id}
              // Replying to someone other than the thread starter prefills their
              // name, since the reply lands at the same level either way.
              initialValue={
                replyingTo.id === thread.id || replyingTo.deleted
                  ? ""
                  : `@${replyingTo.author.name} `
              }
              placeholder="Write a reply…"
              submitLabel="Reply"
              autoFocus
              onCancel={() => setReplyingTo(null)}
              onSuccess={() => setReplyingTo(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CommentItem({
  actionUrl,
  comment,
  onReply,
}: {
  actionUrl: string;
  comment: CommentView;
  onReply: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const deleteFetcher = useFetcher();

  const isDeleting =
    deleteFetcher.state !== "idle" &&
    deleteFetcher.formData?.get("intent") === "delete";

  if (comment.deleted) {
    return (
      <div className="flex gap-3">
        <div className="size-8 shrink-0 rounded-full bg-muted" />
        <p className="py-1 text-sm text-muted-foreground italic">[deleted]</p>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", isDeleting && "opacity-50")}>
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className="shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{comment.author.name}</span>
          {comment.isCourseInstructor && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Instructor
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(comment.createdAt)}
          </span>
          {comment.editedAt && (
            <span
              className="text-xs text-muted-foreground italic"
              title={`Edited ${formatTimestamp(comment.editedAt)}`}
            >
              edited {formatTimestamp(comment.editedAt)}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-2">
            <CommentComposer
              actionUrl={actionUrl}
              commentId={comment.id}
              initialValue={comment.body ?? ""}
              placeholder="Edit your comment…"
              submitLabel="Save changes"
              autoFocus
              onCancel={() => setEditing(false)}
              onSuccess={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <div
              className="prose prose-sm prose-neutral dark:prose-invert mt-1 max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: comment.bodyHtml ?? "" }}
            />

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Reply className="size-3.5" />
                Reply
              </button>

              {comment.canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </button>
              )}

              {comment.canDelete && (
                <deleteFetcher.Form
                  method="post"
                  action={actionUrl}
                  onSubmit={(event) => {
                    if (!confirm("Delete this comment?")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="commentId" value={comment.id} />
                  <button
                    type="submit"
                    disabled={isDeleting}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                    {isDeleting ? "Deleting…" : "Delete"}
                  </button>
                </deleteFetcher.Form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Write/Preview composer. Preview is a server round-trip to the comments
 * resource route, reusing the exact render path the stored comment will use —
 * a client-side preview using a different renderer can disagree with the
 * server, and a lying preview is worse than none.
 *
 * Passing `commentId` turns this into an edit composer.
 */
function CommentComposer({
  actionUrl,
  parentId = null,
  commentId,
  initialValue = "",
  placeholder,
  submitLabel,
  autoFocus = false,
  onCancel,
  onSuccess,
}: {
  actionUrl: string;
  parentId?: number | null;
  commentId?: number;
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [tab, setTab] = useState("write");
  const submitFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const previewFetcher = useFetcher<{ html: string | null }>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSubmitting = submitFetcher.state !== "idle";
  const submitted = submitFetcher.state === "idle" && submitFetcher.data?.ok;

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
      // Land the caret after any prefilled @name.
      const end = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(end, end);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!submitted) return;
    setValue("");
    setTab("write");
    onSuccess?.();
    // onSuccess is a render-scoped callback; the guard above makes this run once
    // per successful submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  function requestPreview() {
    setTab("preview");
    previewFetcher.submit(
      { intent: "preview", body: value },
      { method: "post", action: actionUrl }
    );
  }

  const trimmed = value.trim();
  const tooLong = trimmed.length > MAX_COMMENT_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !isSubmitting;

  return (
    <submitFetcher.Form method="post" action={actionUrl}>
      <input
        type="hidden"
        name="intent"
        value={commentId ? "edit" : "create"}
      />
      {commentId && (
        <input type="hidden" name="commentId" value={commentId} />
      )}
      {parentId !== null && (
        <input type="hidden" name="parentId" value={parentId} />
      )}

      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (next === "preview") {
            requestPreview();
          } else {
            setTab(next);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContentNoShift>
          <TabsContent value="write">
            <Textarea
              ref={textareaRef}
              name="body"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={4}
              // A convenience, not the control — the server enforces the limit.
              maxLength={MAX_COMMENT_LENGTH}
              className="min-h-24"
            />
          </TabsContent>

          <TabsContent value="preview">
            <div className="min-h-24 rounded-md border px-3 py-2">
              {previewFetcher.state !== "idle" ? (
                <p className="text-sm text-muted-foreground">
                  Rendering preview…
                </p>
              ) : previewFetcher.data?.html ? (
                <div
                  className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words"
                  dangerouslySetInnerHTML={{
                    __html: previewFetcher.data.html,
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing to preview yet.
                </p>
              )}
            </div>
          </TabsContent>
        </TabsContentNoShift>
      </Tabs>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>

        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}

        <span
          className={cn(
            "ml-auto text-xs text-muted-foreground",
            tooLong && "text-destructive"
          )}
        >
          {trimmed.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
        </span>
      </div>

      {submitFetcher.data?.error && (
        <p className="mt-2 text-sm text-destructive">
          {submitFetcher.data.error}
        </p>
      )}
    </submitFetcher.Form>
  );
}
