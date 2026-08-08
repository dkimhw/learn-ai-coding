import { Outlet } from "react-router";
import type { Route } from "./+types/layout.app";
import { UserRole } from "~/db/schema";
import { getCourseById } from "~/services/courseService";
import { Sidebar } from "~/components/sidebar";
import { DevUI } from "~/components/dev-ui";
import { Toaster } from "sonner";
import { getAllUsers, getUserById } from "~/services/userService";
import { getCurrentUserId, getDevCountry } from "~/lib/session";
import {
  getRecentlyProgressedCourses,
  calculateProgress,
  getCompletedLessonCount,
  getTotalLessonCount,
} from "~/services/progressService";
import { getCountryTierInfo, COUNTRIES } from "~/lib/ppp";
import { isTeamAdmin } from "~/services/teamService";
import {
  getNotifications,
  getUnreadCount,
  RECENT_NOTIFICATION_LIMIT,
} from "~/services/notificationService";

/**
 * The course the instructor is currently working inside, read off the path
 * rather than passed down from the route.
 *
 * Deriving it here means every existing `instructor/:courseId/*` route lights
 * up the sidebar's course section without being modified — a lesson editor, a
 * module, the roster, and analytics all name the same course. `/instructor` and
 * `/instructor/new` do not match, so the section is absent there.
 */
function currentCourseIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/instructor\/(\d+)(?:\/|$)/);

  return match ? parseInt(match[1], 10) : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const users = getAllUsers();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  const devCountry = await getDevCountry(request);
  const countryTierInfo = getCountryTierInfo(devCountry);

  const recentCourses = currentUserId
    ? getRecentlyProgressedCourses(currentUserId).map((course) => {
        const completedLessons = getCompletedLessonCount(
          currentUserId,
          course.courseId
        );
        const totalLessons = getTotalLessonCount(course.courseId);
        const progress = calculateProgress(
          currentUserId,
          course.courseId,
          false,
          false
        );
        return {
          courseId: course.courseId,
          title: course.courseTitle,
          slug: course.courseSlug,
          coverImageUrl: course.coverImageUrl,
          completedLessons,
          totalLessons,
          progress,
        };
      })
    : [];

  // The section only offers links; each target route still enforces its own
  // access rule. It is withheld from anyone who cannot see the course at all,
  // so a student or a signed-out visitor never learns a course title from it.
  const courseId = currentCourseIdFromPath(new URL(request.url).pathname);
  const course = courseId === null ? null : getCourseById(courseId);
  const canSeeCourse =
    !!course &&
    !!currentUser &&
    (currentUser.role === UserRole.Admin ||
      (currentUser.role === UserRole.Instructor &&
        course.instructorId === currentUser.id));

  // Only instructors have a bell, so nobody else pays for the two queries. They
  // run on every navigation, which is what keeps the badge honest without
  // polling — see the PRD's note on scale.
  const isInstructor = currentUser?.role === UserRole.Instructor;
  const notifications = isInstructor
    ? getNotifications({
        userId: currentUser.id,
        limit: RECENT_NOTIFICATION_LIMIT,
      })
    : [];
  const unreadNotificationCount = isInstructor
    ? getUnreadCount(currentUser.id)
    : 0;

  return {
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      linkUrl: n.linkUrl,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
    unreadNotificationCount,
    currentCourse:
      canSeeCourse && course ? { id: course.id, title: course.title } : null,
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          avatarUrl: currentUser.avatarUrl ?? null,
        }
      : null,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries: COUNTRIES,
    isTeamAdmin: currentUserId ? isTeamAdmin(currentUserId) : false,
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const {
    users,
    currentUser,
    currentCourse,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries,
    isTeamAdmin: userIsTeamAdmin,
    notifications,
    unreadNotificationCount,
  } = loaderData;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentUser={currentUser}
        currentCourse={currentCourse}
        recentCourses={recentCourses}
        isTeamAdmin={userIsTeamAdmin}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <DevUI
        users={users}
        currentUser={currentUser}
        devCountry={devCountry}
        countryTierInfo={countryTierInfo}
        countries={countries}
      />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
