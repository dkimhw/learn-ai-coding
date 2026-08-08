import { UserRole } from "~/db/schema";

// Pure role rules about notifications, kept out of the service so the sidebar
// can apply the same rule the layout loader does without pulling the database
// into the client bundle — see docs/server-only-imports-in-routes.md.

/**
 * Whether a role has anything to be notified about yet.
 *
 * Instructors are told when students enrol; students when someone replies to
 * their comment. Admins receive nothing today, and a bell that can only ever be
 * empty is clutter — so this is the one place that decides who gets one, and
 * both the loader and the sidebar read it.
 */
export function canReceiveNotifications<T extends { role: UserRole }>(
  user: T | null | undefined
): user is T {
  if (!user) return false;

  return user.role === UserRole.Instructor || user.role === UserRole.Student;
}
