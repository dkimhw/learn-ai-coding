import { describe, it, expect } from "vitest";
import { UserRole } from "~/db/schema";
import { canReceiveNotifications } from "./notifications";

describe("canReceiveNotifications", () => {
  it("includes instructors, who are told about enrollments", () => {
    expect(canReceiveNotifications({ role: UserRole.Instructor })).toBe(true);
  });

  it("includes students, who are told about replies to their comments", () => {
    expect(canReceiveNotifications({ role: UserRole.Student })).toBe(true);
  });

  it("excludes admins, who receive nothing yet", () => {
    expect(canReceiveNotifications({ role: UserRole.Admin })).toBe(false);
  });

  it("excludes signed-out visitors", () => {
    expect(canReceiveNotifications(null)).toBe(false);
    expect(canReceiveNotifications(undefined)).toBe(false);
  });
});
