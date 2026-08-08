// ─── Analytics thresholds ───
// The two numbers the analytics pages have to *say out loud* — "we wait for 20
// students", "cohorts under 30 days are left out" — kept here rather than in
// `analyticsService` because that module imports the database.
//
// A route component that reads a constant straight from the service pulls the
// service, `~/db`, and better-sqlite3 into the browser bundle, where requiring
// a native module throws and takes client-side routing down with it: every
// in-app link falls back to a full page load or, in dev, nothing at all. The
// server keeps the constants by re-exporting them, so there is still one
// definition.

/**
 * How long a cohort must have had before its students enter drop-off.
 *
 * A student who enrolled last week has not abandoned lesson 12 — they have not
 * arrived at it yet. Counting them as a failure would make a course that is
 * selling well look like a course that falls apart at the end, which is exactly
 * backwards.
 */
export const MATURITY_WINDOW_DAYS = 30;

/**
 * Students who must have reached a lesson before the page will assert anything
 * about it.
 *
 * The gate is per lesson rather than per course, so a course can carry a verdict
 * on its early lessons and withhold one on its later ones — which is honest,
 * because the later lessons genuinely have less evidence behind them. It is a
 * constant and not a setting: asking an instructor to pick it would be asking
 * them to make a statistics decision they have no basis for.
 */
export const VERDICT_MIN_STUDENTS = 20;
