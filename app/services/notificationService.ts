import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { notifications, NotificationType } from "~/db/schema";

// ─── Notification Service ───
// In-app notifications for a single recipient. Every read and every write is
// scoped to a user id — there is no unscoped accessor on purpose, so no caller
// can accidentally hand one person another person's notifications.

/** How many notifications the bell dropdown shows. */
export const RECENT_NOTIFICATION_LIMIT = 5;

export function createNotification(opts: {
  recipientUserId: number;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl: string;
}) {
  return db.insert(notifications).values(opts).returning().get();
}

/** A user's notifications, newest first. */
export function getNotifications(opts: {
  userId: number;
  limit?: number;
  offset?: number;
}) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, opts.userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(opts.limit ?? RECENT_NOTIFICATION_LIMIT)
    .offset(opts.offset ?? 0)
    .all();
}

export function getUnreadCount(userId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.isRead, false)
      )
    )
    .get();

  return result?.count ?? 0;
}

/**
 * Marks one notification read. The user id is part of the match rather than a
 * separate check, so a request naming someone else's notification updates
 * nothing and returns undefined instead of leaking that the row exists.
 */
export function markAsRead(opts: { notificationId: number; userId: number }) {
  return db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, opts.notificationId),
        eq(notifications.recipientUserId, opts.userId)
      )
    )
    .returning()
    .get();
}

export function markAllAsRead(userId: number) {
  return db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.recipientUserId, userId))
    .returning()
    .all();
}
