# Course Analytics for Instructors

## Problem Statement

An instructor on Cadence can build a course, publish it, and sell it — but once
students start arriving, the platform tells them almost nothing about what
happens next.

Today an instructor can see a raw enrollment count on each course card, and a
per-student table listing each student's progress percentage and quiz badges.
That is the entire picture. From it, an instructor cannot answer any of the
questions they actually care about:

- **"How much have I earned?"** There is no answer anywhere in the product. The
  purchase records exist, but nothing surfaces them. An instructor selling
  courses has no idea what the course has made, whether sales are growing or
  dying, or how much of their revenue comes from team seats versus individuals.
- **"Are people finishing?"** The student table shows individual percentages, so
  an instructor with forty students has to read forty rows and do the averaging
  in their head. There is no course-level view. Worse, the "Completed" status
  shown on that table is derived from a field the application never writes, so
  it reports almost everyone as incomplete regardless of the truth.
- **"Are my quizzes working?"** Quiz results appear as a colored badge per
  student per quiz, showing their best score. Because students retake quizzes
  until they pass, nearly every badge is green — which hides the fact that a
  third of students failed the quiz on their first attempt. The instructor sees
  a wall of green and concludes the lesson is fine.
- **"Where do students give up?"** Nothing in the product answers this. The
  underlying data exists — every lesson a student opens is recorded — but it is
  only ever read one student at a time, never aggregated. An instructor cannot
  tell whether their course loses people at lesson 3 or lesson 30, and therefore
  cannot tell which lesson to fix.

The result is that instructors are flying blind. They can create content and
they can collect money, but they have no feedback loop connecting the two.

## Solution

A dedicated **Course Analytics** page, one per course, reached from the course
editor. It answers the four questions above in a single scroll.

The page opens with **Earnings** — the total the course has collected, broken
down into direct sales versus team purchases, with a count of team seats sold
against seats actually redeemed, and a monthly bar chart showing whether revenue
is growing or flattening. Unredeemed seats are called out because each one is a
student the instructor can chase.

Below that, **Enrollment** shows the total number of enrolled students and a
monthly series so the instructor can see acquisition over time.

**Progress** replaces the single completion-rate number with a distribution:
students are bucketed by how far through the course they are, from 0% to 100%.
The 100% bucket is the completion rate, but the surrounding buckets carry the
diagnosis. A course where students cluster at 5% has a different problem from a
course where they cluster at 90%, and a single averaged percentage cannot tell
those apart.

**Quiz Performance** shows, for each quiz in the course, two distributions side
by side: how students scored on their *first* attempt, and how they scored on
their *best* attempt. The gap between the two is the finding. Alongside them sit
the pass rate and the mean number of attempts it takes to pass — the single most
diagnostic number on the page, because a quiz averaging 2.4 attempts indicates a
lesson that did not teach the material, whatever the final scores look like.

Finally, **Drop-off** plots every lesson in course order with two bars: how many
enrolled students ever opened it, and how many completed it. This separates two
different failures that need two different fixes. If only a handful of students
ever *reach* lesson 9, the problem is everything before it — the course loses
people early. If most students reach lesson 9 but few *complete* it, lesson 9
itself is the problem: too long, too hard, or a broken video.

Every section renders whether or not it has data, each with its own empty state,
so a brand-new course shows an instructor the shape of what they will eventually
see rather than a blank screen.

## User Stories

### Access and navigation

1. As an instructor, I want an Analytics link on my course editor, so that I can
   check on a course's performance while I am working on its content.
2. As an instructor, I want the analytics page to have its own URL, so that I can
   bookmark it and return to it directly.
3. As an instructor, I want to be blocked from viewing analytics for courses I do
   not own, so that other instructors' revenue figures stay private.
4. As an admin, I want to view the analytics for any course, so that I can
   support instructors and investigate platform-wide issues.
5. As a signed-out visitor, I want to be told to sign in rather than shown a
   broken page, so that I understand why I cannot see the content.
6. As a student, I want to be denied access to instructor analytics, so that
   other students' progress and the instructor's earnings are not exposed to me.
7. As an instructor, I want a breadcrumb trail back to my course list and course
   editor, so that I can navigate out of analytics the same way I do elsewhere.
8. As an instructor, I want a loading skeleton while analytics data is fetched,
   so that the page does not flash empty content.
9. As an instructor, I want a clear error page if analytics fails to load, so
   that I know something went wrong rather than assuming I have no data.

### Earnings

10. As an instructor, I want to see the total gross revenue my course has
    collected, so that I know what the course has actually made.
11. As an instructor, I want revenue displayed in the same currency format used
    throughout the rest of the platform, so that the number is unambiguous.
12. As an instructor, I want revenue split between direct individual sales and
    team purchases, so that I understand which channel is driving my income.
13. As an instructor, I want to see how many team seats I have sold, so that I
    know the size of my team business.
14. As an instructor, I want to see how many of those seats have actually been
    redeemed, so that I can identify seats that were paid for but never used.
15. As an instructor, I want unredeemed seats highlighted, so that I can prompt
    the purchasing team to distribute their remaining coupons.
16. As an instructor, I want to see my average revenue per sale, so that I can
    judge the effect of pricing and regional discounts on my actual take.
17. As an instructor, I want a monthly bar chart of revenue, so that I can see
    whether sales are growing, flat, or declining.
18. As an instructor, I want months with no sales to appear as empty bars rather
    than being skipped, so that gaps in my sales history are visible rather than
    compressed away.
19. As an instructor with no sales yet, I want a clear "no sales yet" message
    instead of an empty chart, so that I do not mistake it for a broken page.
20. As an instructor running a free course, I want the earnings section to
    display sensibly at zero, so that the page still works for courses that were
    never intended to make money.
21. As an instructor, I want revenue figures to reflect what students actually
    paid after regional pricing discounts, so that the number matches what I
    would be paid rather than an inflated list price.

### Enrollment

22. As an instructor, I want to see the total number of students enrolled in my
    course, so that I know the size of my audience.
23. As an instructor, I want a monthly enrollment series, so that I can see
    whether my course is still attracting new students.
24. As an instructor, I want enrollment counted separately from purchases, so
    that students who joined via a redeemed team coupon are counted as students
    even though they did not personally buy the course.
25. As an instructor with no students yet, I want a clear empty state, so that I
    understand the course simply has no enrollments rather than assuming a bug.
26. As an instructor, I want to see enrollment even when revenue is zero, so that
    a free or promotional course still shows me my audience.
27. As an instructor, I want to see revenue even when enrollment is zero, so that
    team seats I have sold but which nobody has redeemed are still visible to me.

### Progress and completion

28. As an instructor, I want students grouped into progress bands rather than
    reduced to a single average, so that I can see the actual shape of how far
    people get.
29. As an instructor, I want to see how many students are at 0% — enrolled but
    never started — so that I can identify an onboarding problem.
30. As an instructor, I want to see how many students have completed 100% of the
    course, so that I know my true completion rate.
31. As an instructor, I want to see students clustered in the middle bands, so
    that I can distinguish a course people abandon early from one they abandon
    near the end.
32. As an instructor, I want completion derived from actual lesson progress, so
    that the number reflects what students really did rather than a status flag
    the platform never sets.
33. As an instructor, I want each progress band labeled with a raw student count,
    so that I can tell whether a band represents two students or two hundred.
34. As an instructor with a course that has no lessons yet, I want the progress
    section to say so, so that I am not shown a meaningless distribution.

### Quiz performance

35. As an instructor, I want a score distribution for each quiz in my course, so
    that I can see how students are performing on each assessment.
36. As an instructor, I want to see first-attempt scores, so that I can tell
    whether the lesson taught the material before students started retrying.
37. As an instructor, I want to see best-attempt scores alongside first-attempt
    scores, so that I can tell whether students eventually recovered.
38. As an instructor, I want to see the gap between first and best attempts, so
    that I can distinguish a confusing quiz from a lesson that never landed.
39. As an instructor, I want the mean number of attempts required to pass each
    quiz, so that I have a single number identifying my most problematic lessons.
40. As an instructor, I want the pass rate for each quiz, so that I can see
    whether my passing threshold is set appropriately.
41. As an instructor, I want to know which lesson each quiz belongs to, so that I
    can navigate straight to the content that needs revising.
42. As an instructor, I want quiz distributions labeled with the number of
    students who attempted, so that I do not over-read a distribution built from
    three data points.
43. As an instructor, I want distributions shown as raw counts rather than
    percentages when samples are small, so that a single student is not presented
    as "33% of my cohort".
44. As an instructor whose course has no quizzes, I want to be told that
    explicitly, so that I know the section is empty by design and can consider
    adding assessments.
45. As an instructor, I want quiz scores displayed as familiar percentages even
    though they are stored as fractions, so that I do not have to interpret
    decimal values.

### Drop-off

46. As an instructor, I want to see every lesson in my course in the order
    students encounter them, so that drop-off reads as a journey.
47. As an instructor, I want to see how many students ever opened each lesson, so
    that I can see the cohort thinning as the course progresses.
48. As an instructor, I want to see how many students completed each lesson
    alongside how many opened it, so that I can spot lessons students start but
    abandon.
49. As an instructor, I want lessons nobody has ever opened to still appear in
    the chart, so that the lesson with the most severe problem is not silently
    omitted for having no data.
50. As an instructor, I want to identify the single biggest drop between
    consecutive lessons, so that I know where to focus my editing effort first.
51. As an instructor, I want lesson titles readable in the chart, so that I can
    identify the problem lesson without cross-referencing positions.
52. As an instructor, I want the drop-off chart to work even though students can
    jump between lessons freely, so that the numbers are not distorted by
    non-linear navigation.
53. As an instructor, I want to navigate from a problem lesson in the chart to
    that lesson's editor, so that I can act on what I have learned.
54. As an instructor whose course has no student activity, I want a clear empty
    state on the drop-off section, so that I am not shown a flat meaningless
    chart.

### Presentation and consistency

55. As an instructor, I want all four sections present on every visit regardless
    of data, so that the page layout is stable as my course grows.
56. As an instructor, I want charts that are legible in both light and dark mode,
    so that the page matches the rest of the platform in whichever theme I use.
57. As an instructor, I want charts that are readable on a narrow screen, so that
    I can check on my course from a laptop or tablet.
58. As an instructor, I want the two series in the drop-off chart to be visually
    distinguishable without relying on color alone, so that the chart is readable
    if I have difficulty distinguishing colors.
59. As an instructor, I want the analytics page to load quickly even for a course
    with hundreds of students, so that checking my numbers is not a chore.
60. As an instructor, I want the course editor to remain as fast as it is today,
    so that adding analytics does not slow down the work of building content.

## Implementation Decisions

### Route and page structure

- A **new route** is added at an analytics path nested under the existing
  instructor course path, registered explicitly in the route configuration
  (the project registers routes explicitly rather than relying on filesystem
  discovery, despite the file-based naming convention).
- The page has its **own loader**. Analytics queries deliberately do **not** run
  inside the existing course editor loader. The editor is visited constantly
  during content authoring, and attaching four aggregate queries to it would tax
  every lesson reorder and title edit.
- Analytics is a **route, not a tab**. The course editor's existing tab strip is
  client-side component state with no URL representation, so adding a fifth tab
  would make analytics unbookmarkable and unlinkable, and would grow an already
  very large route module.
- **Authorization mirrors the existing student roster route**: authenticated,
  role of instructor or admin, and ownership of the course unless the viewer is
  an admin. Failures throw typed responses rendered by an error boundary with the
  same 401/403/404 handling used elsewhere in the instructor area.

### New service module

- A **new analytics service** is introduced in the services layer, with an
  accompanying test file as the project's service standard requires.
- It exposes **four independent functions**, one per widget: revenue by month,
  progress buckets, quiz distributions, and the lesson funnel. Each is scoped to
  a single course and takes the course identifier as its only argument, so the
  object-parameter convention for multi-argument signatures does not apply.
- Functions are kept separate rather than combined into one page-payload
  function so that each can be tested against its own narrow fixture. The
  aggregation queries are the most likely place for subtle correctness bugs — a
  grouping that silently drops rows still renders a plausible-looking chart — so
  isolated testability is the priority.
- **Each function must be a single aggregate query.** The existing student roster
  computes progress per student and best quiz attempt per student per quiz in
  nested loops; replicating that pattern would issue hundreds of queries for a
  moderately sized course. Analytics uses grouped aggregation instead.
- **Zero-row behavior is part of the contract.** Lessons with no progress
  records, progress buckets with no students, and quizzes with no attempts must
  all still appear in the returned data. The lesson funnel in particular must be
  built by starting from the course's ordered lesson list and joining progress
  onto it, not by grouping the progress table — otherwise the lesson no student
  has ever opened, which is the most important signal on the chart, disappears
  from it. These zero-row cases are the first thing the tests should cover.

### Metric definitions

- **Revenue** is the sum of amounts actually paid, which are already stored
  net of regional purchasing-power discounts applied at checkout. No list-price
  reconstruction and no discount-forgone calculation is performed.
- **Team purchases** are stored as a single transaction row whose amount is the
  unit price multiplied by seat quantity. The seat count is not stored on the
  transaction; it is derived by counting the coupons generated from that
  transaction. Redeemed seats are those coupons carrying a redemption record.
- **Enrollment and purchase are decoupled.** Redeeming a team coupon creates an
  enrollment with no corresponding transaction row, so enrollments can exceed
  purchases. Conversely, unredeemed seats represent revenue with no enrolled
  student. Both directions must be handled; neither count may be used as a proxy
  for the other.
- **Completion is derived from lesson progress**, computing the proportion of the
  course's lessons a student has completed and assigning them to a band. It
  deliberately does **not** read the enrollment completion timestamp, because no
  code path in the application writes that field.
- **Progress bands** are 0%, 1–25%, 26–50%, 51–75%, 76–99%, and 100%. The 100%
  band is the course completion rate.
- **Quiz distributions** are computed twice per quiz: once over each student's
  first attempt and once over each student's best attempt. Scores are stored as
  fractions between zero and one and must be rendered as percentages. Retakes
  are common and converge upward, so a best-attempt-only distribution would
  report near-universal success on quizzes that many students initially failed;
  showing both is what makes the section informative. Mean attempts-to-pass is
  reported alongside.
- **Drop-off** is measured per lesson as two counts: students who ever opened the
  lesson, and students who completed it. "Opened" is reliable because progress
  records are written by the lesson loader when the lesson is viewed. No sequence
  or ordering assumption is made about student navigation, since lessons are not
  gated — the chart simply reports two independent counts per lesson, displayed
  in course order derived from module position and lesson position.

### Time handling

- **No date-range filter control** is added anywhere on the page.
- **Revenue and enrollment** are presented as monthly series, derived from the
  timestamps those records carry.
- **Progress, quiz, and drop-off** are current-state snapshots with no time
  dimension.
- This asymmetry is forced by the data model: lesson progress records carry only
  a completion timestamp, which is null for lessons in progress. There is no
  record of *when* a student reached a lesson. A page-wide date filter would
  therefore apply to half the page and not the other half, which reads as a bug;
  worse, it invites a future "fix" that filters drop-off on completion time,
  silently excluding every still-in-progress student — precisely the population
  drop-off analysis exists to study.

### Charting

- **Recharts is added as a dependency**, installed via the shadcn chart component
  so it arrives with the project's existing UI conventions. The current version
  declares React 19 support, so there is no peer dependency conflict with the
  installed React.
- The project currently has **no charting library and no existing charts**, so
  this establishes the convention. It was chosen over hand-rolled CSS bars on the
  expectation that this page will grow interactive charts.
- Charts must render **client-side**, since the library measures the DOM to size
  itself and the application server-renders.
- The drop-off chart carries roughly twenty categories with long text labels.
  Horizontal bars or another layout that keeps lesson titles legible is required;
  rotated or truncated axis ticks would defeat the purpose of the chart.
- Chart colors must work in both light and dark themes and should not rely on
  color alone to distinguish the two series.

### Reused existing behavior

- Currency formatting uses the platform's existing price formatter.
- Card, skeleton, and button primitives come from the existing component set.
- The error boundary, breadcrumb, and loading-skeleton patterns follow those
  already established across the instructor routes.

## Out of Scope

- **Fixing the dead completion write path.** Nothing in the application writes
  the enrollment completion timestamp, which makes the "Completed" badge on the
  existing student roster effectively unreachable. This PRD routes around it by
  deriving completion from lesson progress, but does not repair it. Repairing it
  changes student-facing behavior and would need a decision about backfilling
  historical enrollments. Separate work.
- **De-duplicating the student roster.** The course editor's students tab and the
  standalone student roster route render substantially the same content. This is
  a pre-existing redundancy. Consolidating it is a refactor of two live pages
  with its own review surface, and folding it in would let a bug in that cleanup
  block the analytics feature.
- **Adding a creation timestamp to lesson progress.** This would make drop-off
  and completion filterable by date. It is a schema migration whose backfill has
  no honest value — the reach time for existing records is genuinely unknown, and
  defaulting it to the completion time would fabricate data that then feeds a
  chart. If wanted, it should be a separate change that begins collecting real
  data going forward.
- **Video-based drop-off.** Measuring where within a lesson's video students
  abandon. The watch-event data is currently negligible, and lesson duration —
  the required denominator — is nullable, so any resulting chart would be empty
  or wrong.
- **Quiz-gated drop-off analysis.** Correlating quiz failures with students never
  progressing further. Interesting, but narrow — it applies only to lessons that
  have quizzes. Better added later as an annotation on the drop-off chart than
  built as a primary mechanism now.
- **Regional-pricing forgone revenue.** Showing list price minus collected as
  "money left on the table". The number is a fiction, since discounted buyers
  largely would not have purchased at full price, and presenting it invites the
  bad decision of disabling regional pricing. It would also require a history of
  the regional-pricing setting that the schema does not keep.
- **Net earnings and platform fees.** There is no fee, payout, or commission
  concept anywhere in the schema. Inventing a rate in order to display a payout
  figure would be worse than showing nothing.
- **Refunds.** No refund concept exists in the data model.
- **Cross-course portfolio analytics.** A dashboard aggregating totals across all
  of an instructor's courses. Three of the four metrics here are inherently
  per-course — a cross-course drop-off chart is meaningless. Only earnings
  genuinely wants a roll-up, and that is a cheap later addition to the existing
  course card grid.
- **Date-range filtering and interactive chart controls.** Covered above.
- **Exporting analytics** to CSV or any other format.
- **Comparing a course against platform averages or other instructors' courses.**
- **Per-student drill-down from analytics.** The existing student roster already
  serves the individual view.

## Further Notes

**On the data currently available.** The development database is very small —
single-digit purchases, enrollments, and quiz attempts, and roughly a dozen video
watch events. Two courses exist, both published and paid, each with around twenty
lessons. This is enough to exercise the queries but not enough to make the charts
look convincing. Extending the seed script with a larger, more realistic cohort
would make the page far easier to evaluate during development, and would surface
layout problems in the twenty-category drop-off chart that a three-student
dataset will hide.

**On small samples.** Even in production, a new course will have a handful of
quiz attempts. Rendering a distribution as percentages when the sample is three
students presents noise as a rate. Raw counts with an explicit sample-size label
are preferred throughout, and this is a display decision worth holding to even
when the data grows.

**On the completion metric divergence.** After this ships, the platform will
report completion two different ways: the student roster's status badge, driven
by a field nothing writes, and the analytics progress distribution, derived from
actual lesson progress. These will disagree, and the analytics figure is the
correct one. This is an accepted temporary inconsistency, not an oversight, and
it argues for prioritizing the roster fix soon afterward.

**On the two failure modes in drop-off.** The value of plotting reached and
completed as separate series is that they call for opposite responses. A lesson
few students reach means the material before it is losing people — the fix is
upstream. A lesson many students reach but few complete means that lesson is the
problem — the fix is local. Any future simplification of this chart into a single
series would collapse that distinction and materially reduce the page's
usefulness.

**On the choice of charting library.** Recharts was selected over CSS-based bars
on the expectation of future interactivity. Every visual specified in this PRD is
a bar chart with a small, known number of categories and no interaction
requirement, so the library is not strictly necessary today. If interactivity
does not materialize, the dependency will be carrying little weight.
