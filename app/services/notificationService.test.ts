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
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";

/**
 * Ordering is by `createdAt`, which several inserts in the same millisecond
 * would tie on. Tests that care about order stamp their own timestamps.
 */
function createAt(opts: {
  recipientUserId: number;
  title: string;
  createdAt: string;
}) {
  return testDb
    .insert(schema.notifications)
    .values({
      recipientUserId: opts.recipientUserId,
      type: schema.NotificationType.Enrollment,
      title: opts.title,
      message: "message",
      linkUrl: "/instructor/1/students",
      createdAt: opts.createdAt,
    })
    .returning()
    .get();
}

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("stores every field and starts unread", () => {
      const notification = createNotification({
        recipientUserId: base.instructor.id,
        type: schema.NotificationType.Enrollment,
        title: "New Enrollment",
        message: "Test User enrolled in Test Course",
        linkUrl: `/instructor/${base.course.id}/students`,
      });

      expect(notification).toMatchObject({
        recipientUserId: base.instructor.id,
        type: schema.NotificationType.Enrollment,
        title: "New Enrollment",
        message: "Test User enrolled in Test Course",
        linkUrl: `/instructor/${base.course.id}/students`,
        isRead: false,
      });
      expect(notification.createdAt).toBeTruthy();
    });
  });

  describe("getNotifications", () => {
    it("returns the user's notifications newest first", () => {
      createAt({
        recipientUserId: base.instructor.id,
        title: "oldest",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.instructor.id,
        title: "newest",
        createdAt: "2026-03-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.instructor.id,
        title: "middle",
        createdAt: "2026-02-01T00:00:00.000Z",
      });

      const result = getNotifications({ userId: base.instructor.id });

      expect(result.map((n) => n.title)).toEqual([
        "newest",
        "middle",
        "oldest",
      ]);
    });

    it("honours limit and offset", () => {
      for (let i = 1; i <= 5; i++) {
        createAt({
          recipientUserId: base.instructor.id,
          title: `n${i}`,
          createdAt: `2026-01-0${i}T00:00:00.000Z`,
        });
      }

      expect(
        getNotifications({ userId: base.instructor.id, limit: 2 }).map(
          (n) => n.title
        )
      ).toEqual(["n5", "n4"]);

      expect(
        getNotifications({
          userId: base.instructor.id,
          limit: 2,
          offset: 2,
        }).map((n) => n.title)
      ).toEqual(["n3", "n2"]);
    });

    it("does not return another user's notifications", () => {
      createAt({
        recipientUserId: base.instructor.id,
        title: "for instructor",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const result = getNotifications({ userId: base.user.id });

      expect(result).toEqual([]);
    });

    it("returns an empty list for a user with no notifications", () => {
      expect(getNotifications({ userId: base.instructor.id })).toEqual([]);
    });
  });

  describe("getUnreadCount", () => {
    it("counts only the user's unread notifications", () => {
      const read = createAt({
        recipientUserId: base.instructor.id,
        title: "read",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.instructor.id,
        title: "unread",
        createdAt: "2026-01-02T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.user.id,
        title: "someone else's",
        createdAt: "2026-01-03T00:00:00.000Z",
      });

      markAsRead({ notificationId: read.id, userId: base.instructor.id });

      expect(getUnreadCount(base.instructor.id)).toBe(1);
      expect(getUnreadCount(base.user.id)).toBe(1);
    });

    it("is zero when the user has no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("marks one notification read and leaves the others alone", () => {
      const first = createAt({
        recipientUserId: base.instructor.id,
        title: "first",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.instructor.id,
        title: "second",
        createdAt: "2026-01-02T00:00:00.000Z",
      });

      const updated = markAsRead({
        notificationId: first.id,
        userId: base.instructor.id,
      });

      expect(updated?.isRead).toBe(true);
      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });

    it("refuses to mark a notification belonging to another user", () => {
      const other = createAt({
        recipientUserId: base.instructor.id,
        title: "not yours",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const updated = markAsRead({
        notificationId: other.id,
        userId: base.user.id,
      });

      expect(updated).toBeUndefined();
      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });
  });

  describe("markAllAsRead", () => {
    it("marks every notification for the user read", () => {
      createAt({
        recipientUserId: base.instructor.id,
        title: "a",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.instructor.id,
        title: "b",
        createdAt: "2026-01-02T00:00:00.000Z",
      });

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
      expect(
        getNotifications({ userId: base.instructor.id }).every((n) => n.isRead)
      ).toBe(true);
    });

    it("leaves other users' notifications unread", () => {
      createAt({
        recipientUserId: base.instructor.id,
        title: "instructor's",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      createAt({
        recipientUserId: base.user.id,
        title: "student's",
        createdAt: "2026-01-02T00:00:00.000Z",
      });

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.user.id)).toBe(1);
    });
  });
});
