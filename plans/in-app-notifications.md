# Plan: In-App Notifications for Instructors (Enrollment Events)

> Source PRD: `prd/in-app-notifications.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Schema**: New `notifications` table in `app/db/schema.ts` with a `NotificationType` enum (starting with `"enrollment"`). Fields: `id`, `recipientUserId` (FK → users), `type`, `title`, `message`, `linkUrl`, `isRead` (boolean, default false), `createdAt`.
- **Service**: New `notificationService.ts` using ~~positional parameters~~ **object parameters** and direct Drizzle queries. *(Revised during implementation — see Decisions that changed.)*
- **Routes**: `POST /api/notifications/mark-read` (single notification), `POST /api/notifications/mark-all-read` (all for current user). Registered in `app/routes.ts`.
- **Data flow**: `layout.app.tsx` loader fetches unread count + 5 most recent notifications for ~~instructor users~~ **users who can receive notifications**. Data flows through `Sidebar` → `NotificationBell` component.
- **Visibility**: Bell icon renders ~~only for users with role `"instructor"`~~ **for instructors and students, not admins**. *(Revised after Phase 1 — see Decisions that changed.)*

---

## Phase 1: In-App Enrollment Notifications

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

### What to build

A complete in-app notification system for instructors. When a student enrolls in a course, the course's instructor receives a notification visible via a bell icon in the sidebar.

The bell icon shows an unread count badge. Clicking it opens a dropdown with the 5 most recent notifications. Each notification displays a title, message (e.g., "John Doe enrolled in React Fundamentals"), and relative timestamp, with visual distinction between read and unread. Clicking a notification marks it as read and navigates to the course's student list. A "Mark all as read" button clears all unread notifications at once.

The notification is created as a side effect of enrollment — when `enrollUser()` succeeds, the service looks up the course's instructor and the enrolling student's name, then creates a notification record.

Two API routes handle read-state mutations: one for marking a single notification as read, one for marking all as read. Both require an authenticated session and validate that the notification belongs to the current user.

The bell icon and dropdown are only visible to instructors. Students and admins do not see the notification UI.

### Acceptance criteria

- [x] `notifications` table exists with all specified columns and a `NotificationType` enum
- [x] `notificationService` supports: `createNotification`, `getNotifications` (with limit/offset, ordered newest first), `getUnreadCount`, `markAsRead`, `markAllAsRead`
- [x] Enrolling a student creates a notification for the course's instructor with type `"enrollment"`, title `"New Enrollment"`, message `"{studentName} enrolled in {courseTitle}"`, and linkUrl `/instructor/{courseId}/students`
- [x] Bell icon appears in the sidebar header ~~for instructor users only~~ — **later widened to students too**
- [x] Bell icon shows a red unread count badge when count > 0; badge is hidden when count is 0
- [x] Clicking the bell opens a dropdown showing the 5 most recent notifications
- [x] Unread notifications are visually distinct from read notifications in the dropdown
- [x] Clicking a notification marks it as read (via fetcher, no full page reload) and navigates to its `linkUrl`
- [x] "Mark all as read" button in the dropdown marks all notifications as read and updates the badge count
- [x] Dropdown shows "No notifications" message when the user has no notifications
- [x] ~~Students and~~ admins do not see the bell icon — **students now do, deliberately**
- [x] `notificationService` has tests covering: create, get (ordering/limit/offset), unread count, mark as read, mark all as read, user-scoping
- [x] Enrollment-to-notification integration is tested: enrolling a student produces a notification for the instructor with correct fields

**Status**: complete, shipped in `f120449` (merged to `main` via PR #4). Verified by
reading the code and by `pnpm typecheck` + the full vitest suite — not by driving
the UI in a browser.

---

## Decisions that changed

Two things in this plan were overtaken by reality. Recorded here rather than
silently rewritten above, so the reasoning survives.

### `notificationService` takes object parameters, not positional ones

The plan followed the older services (`enrollmentService`, `commentService`) in
using positional parameters. But `createNotification` has four `string`
parameters in a row, and the coding standard exists precisely for that case: at
the call site `title` and `message` are trivially swapped and the compiler
cannot see it.

Single-argument functions (`getUnreadCount`, `markAllAsRead`) stayed positional —
the rule is about ambiguity, not about ceremony.

### Students see the bell after all

Phase 1 scoped notifications to instructors, so an always-empty bell was clutter
for everyone else. The follow-up work (`f88007e`) gave students something to
receive — a notification when someone replies to their comment — which removed
the reason for the restriction. Instructors and students now both get a bell;
admins still receive nothing, so they still have none.

The rule now lives in one place, `canReceiveNotifications` in
`app/lib/notifications.ts`, because the sidebar and the layout loader both need
it and a bell with nothing behind it is the failure mode of them disagreeing.
