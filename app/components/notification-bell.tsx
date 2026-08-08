import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";

export interface SidebarNotification {
  id: number;
  title: string;
  message: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  notifications: SidebarNotification[];
  unreadCount: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "5m ago" for a stored ISO timestamp.
 *
 * Only ever called from inside the open dropdown, which cannot exist during
 * server rendering — otherwise the answer would be computed twice, on two
 * clocks, and hydration would disagree with itself.
 */
function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}

/**
 * The instructor's notification bell: unread count, and the five most recent
 * notifications on click.
 *
 * Read state is written through fetchers rather than form navigations, so
 * marking one read does not move the instructor off the page they are on. The
 * fetcher's completion revalidates the layout loader, which is what refreshes
 * the badge — the component holds no copy of the count.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const markRead = useFetcher();
  const markAllRead = useFetcher();
  const navigate = useNavigate();

  // A dropdown that outlives the click that dismissed it reads as broken, so
  // both a click anywhere else and Escape close it.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleNotificationClick(notification: SidebarNotification) {
    setIsOpen(false);

    if (!notification.isRead) {
      markRead.submit(
        { notificationId: notification.id },
        {
          method: "post",
          action: "/api/notifications/mark-read",
          encType: "application/json",
        }
      );
    }

    // Navigating without waiting for the fetcher: the destination page is the
    // point of the click, and the read state settles behind it.
    navigate(notification.linkUrl);
  }

  function handleMarkAllRead() {
    markAllRead.submit(
      {},
      {
        method: "post",
        action: "/api/notifications/mark-all-read",
        encType: "application/json",
      }
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={isOpen}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        // Opens to the right of the sidebar rather than below the bell, which
        // has a 56px-tall header and no room of its own.
        <div className="absolute left-full top-0 z-50 ml-2 w-80 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">
            Notifications
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent",
                      !notification.isRead && "bg-accent/40"
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      {!notification.isRead && (
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          notification.isRead
                            ? "font-medium text-muted-foreground"
                            : "font-semibold"
                        )}
                      >
                        {notification.title}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {notification.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {notifications.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0 || markAllRead.state !== "idle"}
                className="w-full rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
