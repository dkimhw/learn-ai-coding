import { useNavigate } from "react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { AnalyticsCourse } from "~/services/analyticsService";

// ─── Course scope picker ───
// Moves between the two analytics scopes: every course pooled, or one course on
// its own. Picking is *navigation*, not client-side filtering — the loader
// re-runs and the page recomputes, so the address bar always names what is on
// screen and the back button returns to the scope before it.

/** The pooled scope, first in the list because it is where the page lands. */
const ALL_COURSES = "all";

export function CourseScopePicker({
  courses,
  courseId,
}: {
  courses: AnalyticsCourse[];
  /** The course currently in scope, or null for all courses pooled. */
  courseId: number | null;
}) {
  const navigate = useNavigate();

  function handleChange(value: string) {
    navigate(
      value === ALL_COURSES
        ? "/instructor/analytics"
        : `/instructor/${value}/analytics`
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="analytics-scope"
        className="text-sm text-muted-foreground"
      >
        Showing
      </label>
      <Select
        value={courseId === null ? ALL_COURSES : String(courseId)}
        onValueChange={handleChange}
      >
        <SelectTrigger id="analytics-scope" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COURSES}>All courses</SelectItem>
          {courses.map((course) => (
            <SelectItem key={course.id} value={String(course.id)}>
              {course.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
