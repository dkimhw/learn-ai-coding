# Lesson Comments

Public per-lesson discussion for enrolled students, the course instructor, and admins.

## Goal

Give each lesson a discussion section where enrolled students can ask questions, answer each
other, and get answers from the instructor — visible in-page, alongside the lesson content.

## Shape

Slack-style threading: top-level comments, each with one level of replies. Replies cannot
themselves be replied to; the "Reply" affordance on a reply attaches to the same top-level
parent and prefills `@name` in the composer.

- Top-level comments render **newest-first**.
- Replies within a thread render **oldest-first** (a conversation read backwards is nonsense).
- At most **3 replies** are visible per thread, with a "show N more replies" toggle.

## Access

Read and write are gated identically. A user may participate if any of:

- they are enrolled in the course, **or**
- they are the course's instructor (instructors do not enroll in their own courses), **or**
- they are an admin.

Everyone else does not see the section at all — not a locked or teased version.

**PPP-blocked users are treated as blocked.** `pppBlocked` is a separate flag from `enrolled`
(a user who bought at a regional discount and later travelled is enrolled but blocked from
content). Comments are content, so the same block applies.

## Lifecycle

| Action | Who |
| --- | --- |
| Create | Anyone who passes the access check |
| Edit | The author only |
| Delete | The author, the course instructor, or an admin |

- **Edits** set `editedAt` and display an "edited" marker with the timestamp. There is no edit
  time window — a hard window is infuriating when you notice a broken code fence a minute late,
  and the "edited" marker is the honest version of the same protection.
- **Deletes are soft.** A deleted comment that has replies renders as `[deleted]` so the thread
  stays intact; one with no replies disappears entirely.
- Deleted comments are excluded from the discussion count and from reply counts.

## Content

Markdown, **stored raw and sanitized at render time** — a tightened allowlist then retroactively
protects existing comments, and nothing is lost on write.

The existing `renderMarkdown` runs `marked` with **no sanitizer** (modern `marked` passes raw
HTML straight through; the `sanitize` option was removed in v5). That is fine for
instructor-authored lesson content and is a stored-XSS hole the moment untrusted users write
into the same pipeline. Comments therefore get their own path:

- `renderCommentMarkdown` shares the Shiki highlighter with `renderMarkdown` but adds a
  sanitizer pass and a tight allowlist.
- `renderMarkdown` keeps the permissive path for instructor content.
- Requires a sanitizer dependency: `isomorphic-dompurify` (alternative: `rehype-sanitize`).

Validation, enforced server-side with Zod via `parseFormData`:

- Trimmed before validating and before storing.
- Non-empty after trim.
- Maximum **5,000 characters** — long enough for a stack trace plus explanation, short enough to
  bound the page. `maxLength` on the textarea is a convenience, not the control.

No rate limiting, no profanity filter, no link filter, no approval queue. The instructor's
delete power is the moderation story at this scale.

## UI

A `Card` titled `Discussion (N)`, placed below the quiz section and above the prev/next
navigation on the lesson page.

- Composer at the top of the section, matching newest-first ordering.
- **Write / Preview toggle.** Once content is markdown, preview is the only way a user can tell
  whether a fenced code block will render or splatter.
- Preview is a **server round-trip** to the comments resource route, reusing the exact render
  path the stored comment will use — a client-side preview using a different renderer can
  disagree with the server, and a lying preview is worse than none.
- Reply boxes open inline under a thread.
- **Instructor comments carry a badge.** In a course discussion, knowing which answer came from
  the instructor is the most useful metadata on the page; the role is already on the user record.
- Built from existing primitives (`Card`, `Tabs`, `Textarea`, `Button`, `UserAvatar`). Not
  Monaco — it is a heavy code editor for lesson authoring, and loading it on every lesson page
  for a three-line comment box is a large bundle cost.

## Schema

```ts
export const lessonComments = sqliteTable(
  "lesson_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    parentId: integer("parent_id").references(
      (): AnySQLiteColumn => lessonComments.id
    ),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("lesson_comments_lesson_parent_created").on(
      table.lessonId,
      table.parentId,
      table.createdAt
    ),
  ]
);
```

Two deliberate departures from the surrounding tables:

- **No `updatedAt`.** Other tables have one, but here it would be written by both edits and soft
  deletes, so it cannot answer "was this edited?". A nullable `editedAt` answers exactly that.
- **`parentId` is a self-reference**, which Drizzle requires an explicit `AnySQLiteColumn` return
  type on.

## Architecture

Mutations live in a dedicated resource route hit by fetchers; reads come from the lesson loader
so the section is server-rendered with the page.

The lesson route is already ~1,055 lines with an intent-dispatching action. Routing comment
mutations through it would re-run the quiz fetch, the PPP check, and the progress writes on
every three-line comment. A separate loader for comments would be worse in the other direction:
the section would pop in after the page.

**Authorization logic lives in tested functions, not in the route.** The route parses, calls a
predicate, and turns `false` into a 403. The riskiest code in the feature is otherwise the one
layer this repo has no tests for.

**Structural invariants are enforced in the service, not the route.** In particular, "a reply's
parent must be top-level" is enforced inside `createComment` — a route-level check is one
forgotten call site away from being bypassed, and that is the bug that quietly corrupts the
data model.

**The resource route re-runs every authorization check independently** rather than trusting the
page that rendered the form.

### Files

| File | Change |
| --- | --- |
| `app/db/schema.ts` | Add `lessonComments` |
| `drizzle/` | Generated migration |
| `app/services/commentService.ts` | Data access; soft delete; parent-must-be-top-level invariant; `limit`/`offset` in the signature |
| `app/services/commentService.test.ts` | Service + predicate tests |
| `app/lib/markdown.server.ts` | Add `renderCommentMarkdown` |
| `app/routes/courses.$slug.lessons.$lessonId.comments.tsx` | Resource route; intents `create`, `edit`, `delete`, `preview` |
| `app/routes/courses.$slug.lessons.$lessonId.tsx` | Fetch comments in the loader; render the section |
| `app/components/lesson-comments.tsx` | UI |
| `app/routes.ts` | Register the resource route |
| `scripts/seed.ts` | Drop + seed |

Authorization predicates (`canViewComments`, `canModifyComment`) live alongside the service and
are unit-tested.

## Pagination

Deferred, but the seam is built. `commentService` takes `limit` and `offset` from day one with a
generous default (100); the loader passes nothing and there is no "load more" button. When a
lesson actually reaches that volume, the change is a button — not a migration.

Unbounded fetches are a real problem at hundreds of comments per lesson. This platform is
nowhere near that, and building fetcher-driven pagination now spends meaningful complexity on a
load profile that does not exist.

## Testing

Follows the existing convention: real in-memory SQLite built from the actual migrations, with
`vi.mock("~/db")` swapping in the test database. No route tests — this repo has none, and
establishing that convention has blast radius beyond this feature.

Coverage must include:

- Access predicates: enrolled / instructor / admin / neither / PPP-blocked.
- Ownership: author can edit and delete; a non-author cannot edit; instructor and admin can
  delete any.
- The parent-must-be-top-level invariant, asserted at the service boundary.
- Soft delete: tombstone retained when replies exist, removed when they do not; deleted comments
  excluded from counts.
- Length and trim validation at both boundaries.

## Seed data

`scripts/seed.ts` drops and rebuilds tables, so it needs a matching `DROP TABLE IF EXISTS
lesson_comments`. It also seeds a realistic handful, chosen so the states that are hard to reach
by happy-path clicking are visible on first load:

- A thread containing a fenced code block.
- A soft-deleted parent with surviving replies (renders `[deleted]`).
- A thread with more than 3 replies (triggers "show N more").
- At least one instructor reply (exercises the badge).

## Out of scope

Notifications (in-app or email), @-mentions, pagination UI, reactions, a moderation or report
queue, realtime updates. Ably appears in the README but is not a dependency and is not used
anywhere in the codebase — there is no realtime infrastructure to hook into. Comment posting is
a normal form submission plus React Router revalidation.
