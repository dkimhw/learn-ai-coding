# Plan: Instructor Course Analytics

> Source PRD: `prd/instructor-course-analytics.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: a new per-course instructor route at `instructor/:courseId/analytics`,
  registered in `app/routes.ts` inside the app layout alongside the existing
  `instructor/:courseId/*` routes. It is a normal navigable route with its own
  URL, not a modal or a tab of the editor.
- **Authorization**: mirrors `instructor/:courseId/students` exactly — no session
  is 401, a role other than instructor or admin is 403, a non-numeric or unknown
  course id is 400/404, an instructor who does not own the course is 403, an
  admin is allowed through.
- **Schema**: no new tables and no new columns. Every metric is an aggregate read
  over data that already exists — `lessonProgress`, `enrollments`, `purchases`,
  `coupons`, `lessonComments`, `modules`, `lessons`. The one write this work
  introduces is to the existing, currently-unwritten `enrollments.completedAt`.
- **Key models** (service return shapes, named consistently across phases):
  - `LessonDropOff` — one row per lesson in course order, carrying lesson id,
    title, module and lesson position, students reached, students completed, and
    the discussion rate.
  - `ProgressBand` — one of `0`, `1-25`, `26-50`, `51-75`, `76-99`, `100`, with a
    raw student count.
  - `CourseRevenueSummary` — gross collected, sale count, seats sold, seats
    redeemed.
  - `WorstDropOff` — lesson id, lesson title, and the size of the fall; the
    narrow read used by the course grid.
- **Service boundary**: all aggregation lives in a new `analyticsService`. Routes
  call it and render; they never build queries. It carries unit tests per the
  repo's service conventions. Aggregation is computed live per request — no
  cache, no summary tables, no background jobs.
- **Definitions fixed for the whole feature**:
  - *Reach* — a `lessonProgress` row exists for that student and lesson in any
    state. This is the backbone of drop-off and the sole basis for verdicts.
  - *Completion* — `lessonProgress.status = completed`. Self-reported, always
    labelled as such, never drives a verdict.
  - *Lesson order* — module position, then lesson position within module.
  - *Worst drop-off* — the largest fall in reached-student count between
    consecutive lessons in course order.
  - *Verdict threshold* — a single named constant in the service: at least 20
    students reached, evaluated per lesson.
  - *Maturity filter* — students are cohorted by enrollment month; only cohorts
    at least 30 days old enter drop-off, and all included cohorts pool into one
    curve.
- **Charting**: Recharts, added as a dependency in the phase that first needs it.
  Charts follow the project's data visualization conventions for palette,
  labelling, and light/dark treatment. The counts / percentages toggle is
  client-side state, not persisted between visits, and scoped to a section
  rather than the whole page (revised after review — see phase 6).
- **Seed data**: the seed script grows a high-volume course (~60 students across
  ~6 months, decaying progress) and a low-volume course (~8 students,
  deliberately under threshold). Planted anomalies land in the phases that detect
  them, so each detector is checked against a known answer.

---

## Phase 1: Analytics route skeleton and access control

**User stories**: 1, 2, 3, 4, 5, 6, 7, 9, 10 (8 lands with the first real chart)

### What to build

A reachable, bookmarkable Course Analytics page at
`instructor/:courseId/analytics` that enforces the full authorization rule and
renders one genuinely computed number — the course's enrolled student count —
sourced from a new `analyticsService`. Analytics links appear on the course
editor and on each card in the instructor course list. Breadcrumbs lead back to
the course list and the course editor. A signed-out visitor is told to sign in; a
student is refused; an admin viewing someone else's course gets through. Errors
render the established instructor-route error presentation rather than a blank
or broken page.

This slice is deliberately thin on content and complete on plumbing: route,
auth, navigation, service module, and its first unit tests all exist end to end.

### Acceptance criteria

- [ ] `instructor/:courseId/analytics` is registered and renders for the course owner
- [ ] The page displays a real enrolled-student count read through `analyticsService`
- [ ] `analyticsService` exists with unit tests covering the enrollment count read
- [ ] Signed-out request is rejected with a sign-in message, not a broken page
- [ ] A student role is refused; an admin is allowed through for any course
- [ ] An instructor is refused analytics for a course they do not own
- [ ] Non-numeric and unknown course ids are rejected distinctly
- [ ] An Analytics link is present on the course editor and on each course-list card
- [ ] Breadcrumbs navigate back to the course list and the course editor
- [ ] An error state renders when the loader fails

---

## Phase 2: Seed volume and enrollment spread

**User stories**: 68, 69, 72, 73

### What to build

Rework the seed script so the data underneath every later phase is realistic
enough to judge the page by eye. Two contrasting courses: a high-volume course
with roughly 60 students whose enrollment dates span about six months rather than
clustering, and a low-volume course with roughly 8 students that sits
deliberately below the verdict threshold. Progress decays through the course
instead of the current near-universal completion, so charts show a curve rather
than a flat line.

The two planted anomalies — the drop-off cliff and the comment spike — are
deliberately not part of this phase; they arrive with the detectors that find
them, in phases 6 and 8.

### Acceptance criteria

- [x] Seed produces a high-volume course with roughly 60 enrolled students
- [x] Enrollment dates on that course span roughly six months, with several distinct months represented
- [x] Some cohorts are older than 30 days and some are more recent
- [x] Lesson progress decays across course order rather than being uniformly complete
- [x] Seed produces a low-volume course with roughly 8 students
- [x] Re-running the seed is repeatable and leaves the database in a usable state

---

## Phase 3: Completion tracking fix and backfill

**User stories**: 56, 57, 64, 65, 66, 67

### What to build

Make enrollment completion real. When a student marks the final outstanding
lesson of a course complete, their enrollment is marked complete. Existing
enrollments that already satisfy that condition are backfilled so earned history
is not lost. Roster, student dashboard, and the analytics page then read one
consistent notion of completion.

This has a deliberate student-facing side effect: the "completed courses" section
of the student dashboard, currently always empty, starts working.

### Acceptance criteria

- [ ] Completing the last outstanding lesson in a course marks the enrollment complete
- [ ] Completion is idempotent — re-completing a lesson does not corrupt or re-stamp the enrollment
- [ ] A backfill marks every existing enrollment that already meets the condition
- [ ] The instructor student roster shows accurate completion badges
- [ ] The student dashboard's completed-courses section populates
- [ ] Service unit tests cover completion on the final lesson, non-completion before it, and the backfill
- [ ] The completion figure derives from lesson progress, not from a flag nothing sets

---

## Phase 4: Orientation KPI tiles

**User stories**: 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28

### What to build

The row of KPI tiles at the top of the analytics page: students enrolled,
completion rate, gross collected, sale count, team seats sold, and team seats
redeemed. Gross collected sums actually-paid amounts so regional pricing is
already reflected, is rendered in the product's standard currency format, and is
labelled *gross collected* — never earnings or payout. Unredeemed seats are
visually emphasised as the one figure that implies an action: chase the team
admin. Sale count and student count are labelled to make clear they are
deliberately different, since one team purchase carries several coupons.

The degenerate cases are part of the slice, not a follow-up: a free course reads
sensibly at zero, enrollment shows even when revenue is zero, and revenue shows
even when enrollment is zero.

### Acceptance criteria

- [ ] Tiles render enrolled students, completion rate, gross collected, sale count, seats sold, and seats redeemed
- [ ] Gross collected sums paid amounts and uses the product's currency formatting
- [ ] The revenue tile is labelled gross collected, with no earnings or payout wording anywhere on the page
- [ ] Unredeemed seats are visually called out
- [ ] Sale count and student count are labelled so they are not read as the same figure
- [ ] A free course renders all revenue tiles at zero without breaking
- [ ] Enrollment renders with zero revenue, and revenue renders with zero enrollment
- [ ] Service unit tests cover the revenue and seat aggregates, including the zero cases

---

## Phase 5: Lesson drop-off chart

**User stories**: 8, 29, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40

### What to build

The centrepiece. Every lesson in course order, plotted as two series: students
who ever reached it and students who marked it complete. Reach comes from the
passively-written progress row, so the curve reflects behaviour rather than
diligence; the completion series is explicitly labelled self-reported. Plotting
them separately is the point — a lesson few students reach means the material
before it is failing, while a lesson many reach but few finish means that lesson
itself is the problem.

Recharts is added here. Lesson titles appear in hover tooltips rather than as
axis labels, because they cannot fit at twenty-plus categories, and the chart
stays readable at thirty or more lessons. Clicking a lesson goes to its editor,
so finding a problem and fixing it are one motion. A course with no lessons and a
course with no students each get their own explicit empty state, and a loading
skeleton covers the computation.

This phase renders the curve honestly but makes no interpretive claim — the
verdict arrives in phase 6.

### Acceptance criteria

- [x] Every lesson appears in course order: module position, then lesson position
- [x] Reached and completed render as two distinct, separately labelled series
- [x] Reach is derived from the existence of a lesson progress row in any state
- [x] The completion series is labelled self-reported
- [x] Hover tooltips show the full lesson title
- [x] The chart remains readable at 30+ lessons
- [x] Clicking a lesson navigates to that lesson's editor
- [x] A course with no lessons shows an explicit message, not an empty chart
- [x] A course with no enrolled students shows a clear empty state
- [x] A loading skeleton renders while analytics compute
- [x] Service unit tests cover the drop-off read, including lesson ordering across modules

---

## Phase 6: Trustworthy claims — maturity filter, threshold, and units toggle

**User stories**: 34, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 70

### What to build

Everything that makes the page's claims defensible. The maturity filter cohorts
students by enrollment month — enrollment, not purchase, so students who arrived
by redeeming a team coupon still count — and admits only cohorts at least 30 days
old into drop-off, pooling them into a single curve. The number of students
excluded as too recent is displayed alongside the chart, so the adjustment is
visible rather than a hidden hand on the data.

On top of that, the verdict: the largest fall between consecutive lessons is
identified and stated outright — "23% of students stop at Lesson 7" — but only
where at least 20 students reached the lesson. The threshold is per lesson, so a
course can carry verdicts on early lessons and withhold them on later ones. Below
threshold the charts still render in full and only the claim is withheld,
replaced by an explicit "not enough students yet" message that names how many
students are required. Every chart is labelled with the sample it was computed
from. A page-wide counts / percentages toggle lets the instructor read "3 of 12"
or a rate, applying to the whole page at once so no chart is compared against
another in different units.

The seeded drop-off cliff is planted here, at a known lesson, so worst-lesson
detection is verified against a known answer rather than plausible output.

### Acceptance criteria

- [x] Students are cohorted by enrollment month, not purchase date
- [x] Only cohorts at least 30 days old enter drop-off, pooled into one curve
- [x] The count of students excluded as too recent is displayed by the chart
- [x] The worst drop-off point is identified as the largest fall in reached count between consecutive lessons
- [x] The verdict is stated only where at least 20 students reached the lesson
- [x] The threshold is a single named constant in the service, with no user-facing setting
- [x] Below threshold, charts render in full and only the claim is replaced by a "not enough students yet" message
- [x] That message names how many students the threshold requires
- [x] Every chart is labelled with the number of students it was computed from
- [x] A counts / percentages toggle is offered and is not persisted — **revised after review**: the toggle is per section, not page-wide. A control in the page header silently rewrote sections two screens below it, which read as a control that did nothing. Sections read against each other (the drop-off chart and the table restating it) share one toggle; sections answering different questions each own theirs. This supersedes PRD story 46.
- [x] The seed plants a drop-off cliff at a known lesson, and detection identifies that lesson
- [x] Service unit tests cover the maturity filter, the threshold gate, and worst-lesson detection

---

## Phase 7: Progress distribution

**User stories**: 51, 52, 53, 54, 55

### What to build

Replace the single completion percentage with the shape of how far students
actually get. Students are bucketed by proportion of course lessons completed
into six bands — 0%, 1–25%, 26–50%, 51–75%, 76–99%, 100% — each labelled with a
raw student count, so a band that is two students cannot be mistaken for one that
is two hundred. The 0% band is presented as a distinct finding: enrolled and
never started is an onboarding failure, not a content one. The 100% band feeds
the headline completion tile from phase 4, so the single number and the
distribution agree by construction rather than by coincidence.

### Acceptance criteria

- [x] Students are bucketed into the six defined bands
- [x] Each band displays a raw student count
- [x] The 0% band is presented as its own finding, distinct from the first bar of a chart
- [x] The completion tile is derived from the 100% band, so the two cannot disagree
- [x] The distribution honours a counts / percentages toggle — its own, in its section header (see the revision noted in phase 6)
- [x] A course with no students shows an empty state for this section
- [x] Service unit tests cover band boundaries, including the 0% and 100% edges

---

## Phase 8: Discussion rate as a confusion signal

**User stories**: 58, 59, 60, 61, 62, 63, 71

### What to build

A discussion column in the lesson drop-off table, sitting beside each lesson's
drop-off numbers so an instructor can see whether a lesson people abandon is also
one they were asking about. The signal is comments divided by students reached —
normalizing by reach is essential, not cosmetic, because raw counts are
mechanically confounded with traffic and would simply rediscover that earlier
lessons have more of everything. Lessons whose rate runs well above the course's
own median are flagged, since what counts as chatty depends entirely on the
subject and the instructor. A flagged lesson links to its discussion, so the
instructor can read what actually confused people. A course with no comments
leaves the column quietly empty rather than showing zeroes everywhere.

The seeded comment spike is planted here, at a known lesson distinct from the
seeded cliff, so the flag is verified to fire where expected.

### Acceptance criteria

- [x] Discussion rate is computed as comments per student reached, per lesson
- [x] The rate renders as a column in the lesson drop-off table, not a separate section
- [x] Lessons well above the course's own median rate are flagged
- [x] The comparison is intra-course, never against other courses or a platform average
- [x] A flagged lesson links to that lesson's discussion
- [x] A course with no comments renders the column empty rather than filled with zeroes
- [x] The seed plants a comment spike at a known lesson, and the flag fires on that lesson
- [x] Service unit tests cover the rate calculation, the median comparison, and the no-comments case

---

## Phase 9: The course grid hook

**User stories**: 11, 12, 13, 14, 15

### What to build

Close the loop by putting the finding where the instructor already is. Each card
in the instructor course list carries its single worst drop-off point, phrased as
a claim and linking straight into that course's analytics page, so acting on it
takes one click. The same threshold that governs the page governs the card: above
it the card names the worst drop-off, below it the card degrades to a plain
Analytics link so nobody is sent chasing a problem that is really three people,
and with no students at all the card shows nothing and stays clean.

The grid calls the narrow `getWorstDropOff` read rather than computing and
discarding a full analytics payload per card, so an instructor with many courses
does not pay for analytics on their main working page.

### Acceptance criteria

- [x] Each card above threshold names its worst drop-off point
- [x] That message links directly to the course's analytics page
- [x] A course below threshold shows a neutral Analytics link rather than a claim
- [x] A course with no students shows nothing
- [x] The grid uses the narrow worst-drop-off read, not a full analytics payload per card
- [x] The course list stays fast with many courses
- [x] Service unit tests cover the narrow read across the above-threshold, below-threshold, and no-students cases

---

## Phase 10: Course-scoped sidebar navigation

**User stories**: none in the PRD — added after the fact, because reaching
analytics currently costs a trip back through the course list.

### What to build

When the instructor is anywhere inside a course — the editor, a lesson, a module,
the student roster, or analytics — the sidebar grows a section for that course:
its title, and links to Editor, Students, and Analytics. Moving between the three
views of a course stops being a round trip through `/instructor`.

The section is course-scoped, so it appears only on `/instructor/:courseId/*`
routes and disappears elsewhere. It mirrors the existing "Continue learning"
recent-courses block in `app/components/sidebar.tsx` — same visual weight, same
placement conventions — rather than inventing a second navigation idiom. The
active link is highlighted with the same `NavLink` treatment the top-level items
already use, so the instructor can always see which view they are in.

The data it needs — the current course id and title — comes from the app layout
loader, which already feeds the sidebar. Deriving it from the route params rather
than adding a per-route prop keeps every existing instructor route working
without modification.

Authorization is unchanged: the section renders links, and each target route
enforces its own access rule exactly as it does today. A course the instructor
cannot see never becomes the current course in the first place.

### Acceptance criteria

- [x] A course section appears in the sidebar on every `/instructor/:courseId/*` route
- [x] The section shows the course title and links to Editor, Students, and Analytics
- [x] The section is absent on `/instructor`, `/instructor/new`, and all non-instructor routes
- [x] The link matching the current view is visually marked active
- [x] The section renders only for users who can see the course — students and signed-out visitors never see it
- [x] Existing instructor routes need no per-route changes to light it up
- [x] The section follows the existing sidebar's spacing, typography, and NavLink styling

---

## Phase 11: Global Analytics entry and course filter

**User stories**: none in the PRD — added after the fact, so analytics is
reachable without first knowing which course you want, and so an instructor can
read their whole teaching practice at once rather than one course at a time.

### What to build

An "Analytics" item in the instructor section of `navItems`, alongside "My
Courses", pointing at a new `instructor/analytics` route — an all-courses
analytics dashboard in its own right, not a redirect. Both scopes are real,
bookmarkable URLs: `instructor/analytics` is every course pooled,
`instructor/:courseId/analytics` is one. A course picker at the top of the page
moves between them, with **All courses** as the default landing scope and the
first entry in the list. Picking is navigation, not client-side filtering — the
loader re-runs and the page recomputes for the new scope, so the address bar
always names what is on screen and the back button returns to the previous scope.

The picker lists every course the viewer may see: the instructor's own, or all
courses for an admin.

**What pooling means, metric by metric** — the scopes share tiles but not charts,
because not every metric survives being pooled:

- *Tiles* (phase 4) pool honestly. Students enrolled, gross collected, sale
  count, and seats are sums across courses. Completion rate is recomputed from
  the pooled 100% band, not averaged across per-course rates, so a course with
  three students cannot swing the headline as hard as one with sixty.
- *Progress distribution* (phase 7) pools: bands are a proportion of each
  student's own course, so they are already course-relative and comparable.
- *Lesson drop-off* (phase 5) and *discussion rate* (phase 8) do **not** pool —
  "lesson 7" means a different thing in every course, and a pooled curve would be
  an artefact of how courses happen to line up. In All-courses scope these are
  replaced by a per-course table: one row per course carrying its student count
  and its own worst drop-off, each row linking into that course's analytics. This
  reuses the narrow `getWorstDropOff` read from phase 9 rather than computing a
  full payload per course.
- *The verdict threshold* (phase 6) is evaluated per course even in the pooled
  view, so a below-threshold course shows "not enough students yet" in its row
  while its neighbours show real claims. Pooled tiles never inherit a claim a
  single course could not make on its own.
- *The maturity filter* (phase 6) applies per course. The excluded-as-too-recent
  count shown alongside the pooled view is the sum across courses.

An instructor with no courses gets an explicit empty state on the all-courses
page — create your first course — rather than a page of zeroes. The counts /
percentages toggle from phase 6 stays page-local and unpersisted, so changing
scope resets it, consistent with any other visit.

### Acceptance criteria

- [x] An Analytics item appears in the sidebar for instructors and admins, pointing at `instructor/analytics`
- [x] `instructor/analytics` renders a real pooled dashboard, not a redirect
- [x] Both scopes are bookmarkable URLs and the browser back button moves between them
- [x] A course picker appears on both scopes, with All courses as the default and first entry
- [x] An admin sees all courses in the picker; an instructor sees only their own; the picker leaks nothing else
- [x] Selecting a scope navigates and recomputes the page rather than filtering in place
- [x] Pooled tiles sum enrollment, revenue, sales, and seats across courses
- [x] Pooled completion rate is recomputed from the pooled 100% band, not averaged across per-course rates
- [x] The progress distribution pools across courses
- [x] The pooled view shows no cross-course lesson drop-off chart and no pooled discussion table
- [x] The pooled view shows a per-course table with each course's student count and worst drop-off, linking into that course's analytics
- [x] That table uses the narrow worst-drop-off read, not a full analytics payload per course
- [x] The verdict threshold is evaluated per course in the pooled view, and below-threshold courses show the "not enough students yet" message in their row
- [x] The maturity filter applies per course, and the excluded count shown is the sum across courses
- [x] An instructor with no courses sees a create-a-course empty state, not zeroed tiles
- [x] Per-course analytics is unchanged by this phase
- [x] Service unit tests cover the pooled aggregates, the pooled-vs-averaged completion rate, the authorized-course list for both roles, and the no-courses case
