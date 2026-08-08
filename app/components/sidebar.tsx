import { Link, NavLink, Form, useLocation } from "react-router";
import { useState, useEffect } from "react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { UserAvatar } from "~/components/user-avatar";
import {
  NotificationBell,
  type SidebarNotification,
} from "~/components/notification-bell";
import { canReceiveNotifications } from "~/lib/notifications";
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  Shield,
  Tag,
  Users,
  UsersRound,
  Moon,
  Sun,
  LogOut,
  Settings,
} from "lucide-react";

interface CurrentUser {
  id: number;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

interface RecentCourse {
  courseId: number;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  completedLessons: number;
  totalLessons: number;
  progress: number;
}

/** The course the viewer is currently working inside, if any. */
interface CurrentCourse {
  id: number;
  title: string;
}

interface SidebarProps {
  currentUser: CurrentUser | null;
  currentCourse?: CurrentCourse | null;
  recentCourses?: RecentCourse[];
  isTeamAdmin?: boolean;
  /** The viewer's five most recent notifications; empty for non-instructors. */
  notifications?: SidebarNotification[];
  unreadNotificationCount?: number;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: UserRole[] | "all";
  /**
   * Match this path exactly rather than as a prefix.
   *
   * Needed by any item whose path is a prefix of a sibling's: `/instructor`
   * prefixes `/instructor/analytics`, so without this both light up at once and
   * neither tells you where you are. Items whose children are *inside* them —
   * `/courses` and a course detail page — leave it off on purpose.
   */
  end?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Browse Courses",
    to: "/courses",
    icon: <BookOpen className="size-4" />,
    roles: "all",
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    roles: [UserRole.Student],
  },
  {
    label: "My Courses",
    to: "/instructor",
    icon: <GraduationCap className="size-4" />,
    roles: [UserRole.Instructor],
    // The course grid itself. Inside a course the sidebar's course section says
    // where you are, so this does not need to claim it too.
    end: true,
  },
  {
    // All courses pooled. Reachable without first knowing which course you
    // want, which the per-course page cannot be.
    label: "Analytics",
    to: "/instructor/analytics",
    icon: <BarChart3 className="size-4" />,
    roles: [UserRole.Instructor, UserRole.Admin],
  },
  {
    label: "Manage Users",
    to: "/admin/users",
    icon: <Users className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Manage Courses",
    to: "/admin/courses",
    icon: <Shield className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Categories",
    to: "/admin/categories",
    icon: <Tag className="size-4" />,
    roles: [UserRole.Admin],
  },
];

function isVisible(item: NavItem, role: UserRole | null): boolean {
  if (item.roles === "all") return true;
  if (!role) return false;
  return item.roles.includes(role);
}

/** The sidebar's one link treatment, shared so every section matches. */
function navLinkClass(isActive: boolean): string {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  );
}

/**
 * The three views of a course, offered wherever the instructor already is.
 *
 * Moving between the editor, the roster, and analytics used to mean a round
 * trip through `/instructor`. The section is course-scoped: it renders only
 * when the layout has resolved a current course, which happens only on
 * `/instructor/:courseId/*` and only for someone allowed to see that course.
 *
 * Editor stays marked active on a lesson or module route too, because those are
 * the editor — the instructor should never be looking at a sidebar that claims
 * they are nowhere.
 */
function CourseSection({ course }: { course: CurrentCourse }) {
  const { pathname } = useLocation();
  const base = `/instructor/${course.id}`;

  const links = [
    {
      label: "Editor",
      to: base,
      icon: <BookOpen className="size-4" />,
      isActive:
        !pathname.startsWith(`${base}/students`) &&
        !pathname.startsWith(`${base}/analytics`),
    },
    {
      label: "Students",
      to: `${base}/students`,
      icon: <Users className="size-4" />,
      isActive: pathname.startsWith(`${base}/students`),
    },
    {
      label: "Analytics",
      to: `${base}/analytics`,
      icon: <BarChart3 className="size-4" />,
      isActive: pathname.startsWith(`${base}/analytics`),
    },
  ];

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
        Course
      </div>
      <div className="mb-1 truncate px-3 text-sm font-medium" title={course.title}>
        {course.title}
      </div>
      <div className="space-y-1">
        {links.map((link) => (
          // A plain Link carrying the sidebar's own NavLink styling, because
          // active state here is not a path match. `/instructor/:id` prefixes
          // both of its siblings, so NavLink would light Editor up on the
          // roster and on analytics; with `end` it would go dark on a lesson,
          // which is still the editor. The rule is ours, so the markup is too.
          <Link
            key={link.to}
            to={link.to}
            aria-current={link.isActive ? "page" : undefined}
            className={navLinkClass(link.isActive)}
          >
            {link.icon}
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Sidebar({
  currentUser,
  currentCourse = null,
  recentCourses = [],
  isTeamAdmin = false,
  notifications = [],
  unreadNotificationCount = 0,
}: SidebarProps) {
  const currentUserRole = currentUser?.role ?? null;
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Cadence
        </NavLink>
        {/* Same rule the layout loader used to decide whether to fetch any of
            this, so the bell is never present with nothing behind it. */}
        {canReceiveNotifications(currentUser) && (
          <div className="ml-auto">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadNotificationCount}
            />
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems
          .filter((item) => isVisible(item, currentUserRole))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        {isTeamAdmin && (
          <NavLink
            to="/team"
            className={({ isActive }) => navLinkClass(isActive)}
          >
            <UsersRound className="size-4" />
            Team
          </NavLink>
        )}
      </nav>

      {currentCourse && <CourseSection course={currentCourse} />}

      {recentCourses.length > 0 && (
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Recent Courses
          </div>
          <div className="space-y-1">
            {recentCourses.map((course) => (
              <NavLink
                key={course.courseId}
                to={`/courses/${course.slug}`}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <div className="truncate text-sm font-medium">
                  {course.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-sidebar-accent">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-sidebar-foreground/50">
                    {course.progress}%
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={toggleDarkMode}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>

        {currentUser && (
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <UserAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">
                {currentUser.name}
              </div>
              <div className="truncate text-xs capitalize text-sidebar-foreground/50">
                {currentUser.role}
              </div>
            </div>
            <NavLink
              to="/settings"
              title="Settings"
              className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Settings className="size-4" />
            </NavLink>
            <Form method="post" action="/api/logout">
              <button
                type="submit"
                title="Sign out"
                className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </Form>
          </div>
        )}
      </div>
    </aside>
  );
}
