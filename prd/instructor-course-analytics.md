# Instructor Course Analytics

## Problem Statement

An instructor on Cadence can build a course, publish it, and sell it. Once
students start arriving, the platform stops telling them anything useful.

Today the instructor sees an enrollment count on each course card and a
per-student roster listing each student's progress percentage. That is the whole
picture, and it cannot answer the question an instructor actually has, which is
not "how many students do I have" but **"which part of my course is failing
them?"**

Concretely:

- **They cannot tell where students give up.** The platform records every lesson
  a student opens, but that data is only ever read one student at a time. An
  instructor with forty students would have to open forty rosters and reconstruct
  the pattern by hand. Nobody does this, so nobody knows whether the course loses
  people at lesson 3 or lesson 30 — and therefore nobody knows which lesson to
  rewrite.
- **They cannot tell how many students finish.** The roster shows a "Completed"
  badge driven by a field the application never writes. Every instructor is being
  told, incorrectly, that essentially none of their students have finished.
- **They cannot see what they have earned.** Purchase records exist but nothing
  surfaces them. In particular, an instructor who sold a block of team seats has
  no way to learn that some of those paid-for seats were never handed out to
  anyone.
- **They cannot tell which lessons confuse people.** Lesson discussions exist and
  are full of exactly this signal, but there is no view that says "this lesson
  generates far more questions than its traffic warrants."

The instructor has a content problem and the platform gives them a sales
receipt. There is no feedback loop connecting what they built to how it lands.

## Solution

A **Course Analytics** page, one per course, reached from the instructor's course
list and course editor. Its job is not to display metrics — it is to answer one
question: *what should I fix?*

The page opens with a small row of **KPI tiles** giving the instructor their
bearings: students enrolled, completion rate, gross collected, and team seats
sold against seats redeemed. Unredeemed seats are called out, because each one is
a person who paid and never showed up, and the instructor can chase the team
admin about it.

The centrepiece is **lesson drop-off**: every lesson in course order, showing how
many students ever reached it and how many marked it complete. The curve thins as
the course progresses, and where it falls off a cliff is where the course is
losing people. Two separate failures are visible here and they call for opposite
fixes — a lesson few students *reach* means the material before it is the
problem, while a lesson many reach but few *finish* means that lesson itself is
too long, too hard, or broken.

Where the evidence is strong enough, the page states a conclusion outright:
**"23% of students stop at Lesson 7."** Where it is not, it says so plainly
rather than guessing. That same verdict surfaces on the instructor's course grid,
so an instructor who was not thinking about analytics gets told there is
something worth looking at.

Beside each lesson sits its **discussion rate** — comments per student who
reached it. Lessons whose rate runs well above the course's own typical level are
flagged as places students are getting stuck, and unlike a drop-off number this
one comes with the text of what confused them.

Below that, a **progress distribution** replaces the single completion percentage
with the shape of how far students actually get. A course where students cluster
at 5% has a different disease from one where they cluster at 90%, and one
averaged number cannot tell those apart. The 0% band is its own finding: students
who enrolled and never started are an onboarding problem, not a content one.

Throughout, the page is careful about what it does and does not know. Numbers can
be read as raw counts or percentages at the instructor's choice. Students who
enrolled too recently to have progressed are excluded from drop-off rather than
counted as failures, and their number is shown so the exclusion is visible.
Claims about problem lessons are withheld until enough students have passed
through to support them.

## User Stories

### Access and navigation

1. As an instructor, I want an Analytics link on my course editor, so that I can
   check how a course is performing while I am working on its content.
2. As an instructor, I want an Analytics link on each card in my course list, so
   that I can jump straight to the data without opening the editor first.
3. As an instructor, I want the analytics page to have its own URL, so that I can
   bookmark it and return to it directly.
4. As an instructor, I want to be blocked from viewing analytics for courses I do
   not own, so that other instructors' revenue and student data stay private.
5. As an admin, I want to view analytics for any course, so that I can support
   instructors and investigate platform-wide problems.
6. As a student, I want to be denied access to instructor analytics, so that
   other students' progress and the instructor's earnings are not exposed to me.
7. As a signed-out visitor, I want to be told to sign in rather than shown a
   broken page, so that I understand why I cannot see the content.
8. As an instructor, I want a loading skeleton while analytics are computed, so
   that the page does not flash empty content and look broken.
9. As an instructor, I want a clear error state if analytics fail to load, so that
   I know something went wrong rather than concluding I have no students.
10. As an instructor, I want breadcrumbs back to my course list and course editor,
    so that I can navigate out the same way I do everywhere else in the product.

### The course grid hook

11. As an instructor, I want each course card to tell me its single worst
    drop-off point, so that I learn a course needs attention without having to go
    looking for the problem.
12. As an instructor, I want that card message to link straight into the analytics
    page, so that acting on it takes one click.
13. As an instructor, I want a course with too few students to show a neutral
    Analytics link rather than a claim, so that I am not sent chasing a problem
    that is really just three people.
14. As an instructor, I want a course with no students at all to show nothing
    rather than an empty metric, so that a brand-new course's card stays clean.
15. As an instructor with many courses, I want the grid to stay fast, so that
    adding analytics does not make my main working page slow to load.

### Orientation tiles

16. As an instructor, I want to see how many students are enrolled in this course,
    so that I know the size of the audience these numbers describe.
17. As an instructor, I want to see what proportion of students have completed the
    course, so that I have a single headline figure for how it is landing.
18. As an instructor, I want to see the gross amount the course has collected, so
    that I know what it has made.
19. As an instructor, I want that figure labelled as gross collected rather than
    earnings, so that I do not expect it to match a payout.
20. As an instructor, I want revenue displayed in the currency format used
    everywhere else in the product, so that the number is unambiguous.
21. As an instructor, I want revenue to reflect what students actually paid after
    regional pricing, so that the figure matches money received rather than an
    inflated list price.
22. As an instructor, I want to see how many sales the course has made, so that I
    can tell a few large team deals from many individual purchases.
23. As an instructor, I want to see how many team seats I have sold, so that I
    know the size of my team business.
24. As an instructor, I want to see how many of those seats have actually been
    redeemed, so that I can spot seats that were paid for but never used.
25. As an instructor, I want unredeemed seats visually called out, so that I am
    prompted to chase the purchasing team to distribute their remaining coupons.
26. As an instructor running a free course, I want the revenue tiles to display
    sensibly at zero, so that the page still works for courses never meant to
    make money.
27. As an instructor, I want to see enrollment even when revenue is zero, so that
    students who arrived via redeemed team coupons still count as my audience.
28. As an instructor, I want to see revenue even when enrollment is zero, so that
    seats I sold but nobody redeemed are still visible to me.

### Lesson drop-off

29. As an instructor, I want to see every lesson in the order students encounter
    them, so that drop-off reads as a journey through the course.
30. As an instructor, I want to see how many students ever opened each lesson, so
    that I can watch the cohort thin out as the course progresses.
31. As an instructor, I want that "reached" figure derived from students actually
    opening the lesson rather than from a button they had to remember to click,
    so that the curve reflects behaviour rather than diligence.
32. As an instructor, I want to see how many students marked each lesson complete
    alongside how many reached it, so that I can see the gap between arriving and
    finishing.
33. As an instructor, I want the completion series clearly labelled as
    self-reported, so that I know it depends on students clicking a button and do
    not over-read a low number.
34. As an instructor, I want the largest fall between consecutive lessons
    identified for me, so that I do not have to eyeball a twenty-bar chart to
    find the cliff.
35. As an instructor, I want to distinguish a lesson few students reach from a
    lesson many reach but few finish, so that I know whether to fix the material
    before it or the lesson itself.
36. As an instructor, I want to click a lesson in the chart and go to its editor,
    so that finding a problem and fixing it are one continuous motion.
37. As an instructor, I want lesson titles legible rather than truncated into
    unreadable axis labels, so that I can tell which lesson a bar refers to.
38. As an instructor with a long course, I want the chart to stay readable at
    thirty or more lessons, so that the feature does not degrade as I add content.
39. As an instructor with a course that has no lessons yet, I want to be told so
    explicitly, so that I am not shown an empty chart and left guessing.
40. As an instructor with no enrolled students, I want a clear empty state, so
    that I understand there is nothing to measure yet rather than assuming a bug.

### Trustworthy claims

41. As an instructor, I want the page to withhold its "problem lesson" verdict
    until enough students have passed through, so that I do not rewrite a good
    lesson because two people got busy.
42. As an instructor below that threshold, I want to be told data is still being
    gathered, so that the silence reads as patience rather than breakage.
43. As an instructor, I want to know how many students the threshold requires, so
    that I understand what has to happen before the page will start advising me.
44. As an instructor, I want every chart labelled with the number of students it
    is based on, so that I can judge for myself how much weight to put on it.
45. As an instructor, I want to switch between raw counts and percentages, so that
    I can see "3 of 12" when the sample is small and a rate when it is large.
46. As an instructor, I want that choice to apply across the whole page at once,
    so that I am not comparing a percentage in one chart against a count in
    another.
47. As an instructor whose course is selling well, I do not want recently enrolled
    students counted as having dropped out of later lessons, so that growing sales
    do not make my ending look broken.
48. As an instructor, I want students who are still working through the course
    excluded from drop-off rather than counted as failures, so that the number
    means "gave up" rather than "not there yet".
49. As an instructor, I want to see how many students were excluded as too recent,
    so that the adjustment is visible rather than a hidden hand on the data.
50. As an instructor with a brand-new course, I want to understand why drop-off is
    sparse in the first weeks, so that I wait for data rather than assuming the
    feature is broken.

### Progress and completion

51. As an instructor, I want students grouped into progress bands rather than
    reduced to one average, so that I can see the real shape of how far people
    get.
52. As an instructor, I want to see how many students are at 0%, so that I can
    identify an onboarding problem distinct from a content problem.
53. As an instructor, I want to see how many students have completed everything,
    so that I know my true completion rate.
54. As an instructor, I want to see whether students cluster early or late, so
    that I can tell a course people abandon immediately from one they abandon near
    the finish.
55. As an instructor, I want each band labelled with a raw student count, so that
    I can tell whether a band is two students or two hundred.
56. As an instructor, I want completion derived from actual lesson progress, so
    that the figure reflects what students did rather than a flag nothing sets.
57. As an instructor, I want the completion figure on this page to agree with the
    one on my student roster, so that I do not have to work out which page is
    lying.

### Discussion as a confusion signal

58. As an instructor, I want to see how many questions each lesson has attracted,
    so that I can find the places students are getting stuck.
59. As an instructor, I want that count expressed relative to how many students
    reached the lesson, so that early lessons do not look problematic purely
    because more people saw them.
60. As an instructor, I want lessons with unusually high discussion relative to
    the rest of my course flagged, so that I do not have to work out what "high"
    means for my own material.
61. As an instructor, I want the discussion signal presented next to drop-off for
    the same lesson, so that I can see whether a lesson people abandon is also one
    they were asking about.
62. As an instructor, I want to jump from a flagged lesson to its discussion, so
    that I can read what students actually found confusing.
63. As an instructor whose course has no comments, I want the column to be quietly
    empty rather than showing zeroes everywhere, so that the table stays readable.

### Completion tracking correctness

64. As a student, I want my enrollment marked complete when I finish the last
    lesson, so that the course moves into my completed list.
65. As a student, I want courses I have already finished to appear as completed
    without redoing them, so that history I earned before this change is not lost.
66. As an instructor, I want my student roster to show accurate completion badges,
    so that I can see who has actually finished.
67. As an instructor, I want completion to mean the same thing everywhere in the
    product, so that the roster and the analytics page never contradict each other.

### Working with the data during development

68. As a developer, I want seed data with enough students to make the charts
    realistic, so that I can tell whether the page reads well before shipping it.
69. As a developer, I want seeded enrollments spread across several months, so
    that the maturity filter has both mature and recent cohorts to act on.
70. As a developer, I want a seeded course with a deliberate drop-off cliff, so
    that I can verify the worst-lesson detection identifies the right lesson.
71. As a developer, I want a seeded lesson with an outsized number of comments, so
    that I can verify the discussion-rate flag fires where expected.
72. As a developer, I want a seeded course that stays below the verdict threshold,
    so that I can see the "not enough data yet" state without editing constants.
73. As a developer, I want realistic progress decay rather than uniform
    completion, so that the charts show a curve instead of a flat line.

## Implementation Decisions

### Scope and framing

- The page's single purpose is **content diagnosis** — "what should I fix". Every
  other metric on the page is supporting context and loses to diagnosis whenever
  the two compete for space or attention.
- Analytics are **per-course**. There is no cross-course roll-up: a drop-off
  curve spanning two different courses has no meaning.

### New surface

- A new instructor route renders course analytics, keyed by course id, sitting
  alongside the existing per-course instructor routes.
- Authorization mirrors the existing per-course instructor pages exactly:
  unauthenticated is rejected, non-instructor/non-admin roles are rejected,
  invalid or unknown course ids are rejected, and an instructor who does not own
  the course is rejected while an admin is allowed through.
- Loading and error presentation follow the established route conventions already
  used across instructor pages.

### New service module

- All aggregation lives in a new analytics service. Routes call it and render;
  they do not build queries. It carries unit tests per the repo's service
  conventions.
- The service exposes per-course aggregate reads: drop-off by lesson, progress
  band distribution, revenue and seat totals, and the discussion rate by lesson.
  It also exposes a single narrow "worst drop-off point" read used by the course
  grid, so the grid does not have to compute or discard a full analytics payload
  per card.
- Aggregation is computed live per request. No caching layer, no materialized
  summary tables, no background jobs. The data volumes involved do not justify
  them, and adding them now would mean maintaining invalidation for a feature
  whose access pattern is unknown.

### How drop-off is defined

- **Reach** is the primary signal: a student has reached a lesson if a lesson
  progress row exists for that student and lesson in any state. These rows are
  written passively when the lesson page loads, so reach requires no cooperation
  from the student and cannot be forgotten.
- **Completion** is the secondary signal and is explicitly labelled as
  self-reported, because it is only written when a student clicks a button. It is
  displayed alongside reach but never drives a verdict.
- The **worst drop-off point** is the largest fall in reached-student count
  between consecutive lessons in course order.
- Lesson order is course order: module position, then lesson position within
  module.

### The maturity filter

- Students are grouped into cohorts by **enrollment month** — enrollment, not
  purchase, because students who arrived by redeeming a team coupon never made a
  purchase of their own and would otherwise vanish from the analysis.
- Only cohorts at least 30 days old are included in drop-off. All included
  cohorts are **pooled into a single curve** rather than displayed separately.
  Splitting by cohort would be statistically cleaner but would divide an already
  small sample well below the verdict threshold, silencing the page's most
  valuable output.
- The number of students excluded as too recent is displayed alongside the chart.
  The adjustment must be visible, not silent.

### The verdict threshold

- The page will not assert that a lesson is a problem unless at least **20
  students have reached that lesson**. The threshold is per lesson, not per
  course, so a course can carry verdicts on its early lessons and withhold them on
  its later ones — which is honest, because the later lessons genuinely have less
  evidence behind them.
- Below threshold the charts still render in full; only the interpretive claim is
  withheld, replaced by an explicit "not enough students yet" message.
- The same gate governs the course grid hook: above threshold it names the worst
  drop-off, below it degrades to a plain Analytics link, and with no students it
  shows nothing.
- The threshold is a single named constant in the service, not a user-facing
  setting. Asking instructors to choose it would be asking them to make a
  statistics decision they have no basis for.

### Progress distribution

- Students are bucketed by proportion of course lessons completed into bands:
  0%, 1–25%, 26–50%, 51–75%, 76–99%, and 100%. Each band shows a raw student
  count.
- The 0% band is treated as a distinct finding rather than just the first bar,
  since enrolled-but-never-started indicates an onboarding failure rather than a
  content one.
- The 100% band is also surfaced as the headline completion tile, so the single
  number and the distribution are guaranteed to agree by construction.

### Revenue presentation

- Revenue appears as **KPI tiles only**. No revenue trend chart: an instructor
  cannot act on a monthly bar chart, and at realistic early volumes it would be a
  chart of noise.
- Tiles cover gross collected, sale count, seats sold, and seats redeemed, with
  unredeemed seats visually emphasised as the one revenue figure that implies an
  action.
- Gross collected sums actually-paid amounts, so regional pricing discounts are
  already reflected. The figure is labelled **gross collected**, never "earnings"
  or "payout" — there is no fee, commission, or refund concept in the data model,
  and any label implying take-home pay would be a number the instructor compares
  against their bank account and finds wrong.
- A team purchase is one purchase record with several coupons attached, so sale
  count and student count are deliberately different figures and are labelled to
  make that clear.

### Discussion rate

- Per lesson, the service computes comment count divided by students reached.
- Lessons are flagged when that rate sits well above the **course's own median**
  rate. The comparison is intra-course because what counts as a chatty lesson
  depends entirely on the subject and the instructor.
- Normalizing by reach is essential and not optional: raw comment counts are
  mechanically confounded with traffic, so an unnormalized comparison would
  simply rediscover that earlier lessons have more of everything.
- The rate and its flag render as a column in the lesson drop-off table, not as a
  separate section, since it is an annotation on a lesson rather than a topic in
  its own right.

### Completion tracking fix

- Enrollment completion is currently dead: the function that writes it is called
  only from its own test, so the field is never set in production, and both the
  instructor roster and the student dashboard render completion state from it.
- Enrollment completion will be written when a student completes the final
  outstanding lesson in a course.
- Existing enrollments that already satisfy the condition will be backfilled, so
  history is not lost.
- Roster, student dashboard, and analytics then all read a single consistent
  notion of completion.
- This has a deliberate student-facing side effect: the "completed courses"
  section of the student dashboard, currently always empty, begins working.

### Charting and display

- **Recharts** is added as a dependency. The drop-off chart needs real axis
  handling, responsive resizing, and hover tooltips — tooltips are not optional,
  because lesson titles cannot fit as axis labels at twenty-plus categories.
- Charts follow the project's data visualization conventions for palette,
  labelling, and light/dark treatment.
- A **counts / percentages toggle** applies to the whole page at once. It is
  client-side state and is not persisted between visits; page-wide consistency
  matters, cross-session memory does not.
- Every chart is labelled with the sample it was computed from.
- Each section renders its own empty state, so a new course sees the shape of
  what it will eventually get rather than a blank screen.

### Seed data

- The seed script grows two contrasting courses so both sides of the threshold
  are visible without editing code:
  - A **high-volume course**: roughly 60 students enrolled across about six
    months, with realistic progress decay, a deliberate drop-off cliff at a known
    lesson, and a deliberate comment spike at a different known lesson. This
    exercises verdicts, the maturity filter, and outlier flagging, and because the
    anomalies are planted their detection can be checked against a known answer.
  - A **low-volume course**: roughly 8 students, deliberately under threshold, to
    exercise the "not enough data yet" state.
- Enrollment dates must span months rather than clustering, or the maturity
  filter has nothing to filter.
- Progress must decay rather than being uniformly complete. The current seed
  produces near-universal completion, which is the one distribution that makes
  every chart flat and every detector look broken.

## Out of Scope

- **Quiz analytics.** First-attempt versus best-attempt score distributions,
  pass rates, and attempts-to-pass are the sharpest diagnostic signal in the
  schema, but only three quizzes exist across thirty-nine lessons. The section
  would be empty for nearly every course. Revisit once instructors are actually
  writing quizzes.
- **Video engagement analysis.** Rewatch hotspots and abandonment points derived
  from watch-event positions would be the richest possible signal, and are a
  substantial build against currently negligible event volume.
- **Ratings and reviews.** An outcome measure, not a diagnosis — it tells an
  instructor they have a problem without pointing at it.
- **Enrollment and revenue trends over time.** Audience growth rather than
  content diagnosis, and meaningless until volumes are much larger.
- **Cohort-over-cohort comparison** — "did my fix work?". A genuinely valuable
  question that this page does not answer. Deferred because splitting by cohort
  fragments the sample below the verdict threshold. Revisit when courses routinely
  carry hundreds of students.
- **Date-range filters and interactive chart controls** beyond the counts /
  percentages toggle.
- **Cross-course roll-ups** and any instructor-wide dashboard aggregating multiple
  courses.
- **Exporting analytics** in any format.
- **Comparison against platform averages** or other instructors' courses.
- **Per-student drill-down from analytics.** The existing student roster already
  serves the individual view.
- **Automatic lesson completion** from video-ended or quiz-passed events. This
  would materially improve the completion signal and is worth doing, but it
  changes student-facing behaviour and belongs in its own piece of work.
- **Net earnings, fees, payouts, and refunds.** No such concepts exist in the
  data model and inventing them to display a number would be worse than showing
  nothing.
- **Caching, precomputation, or background aggregation.**

## Further Notes

**On the self-reported completion signal.** Lesson completion is written only
when a student clicks a button, so it partly measures conscientiousness rather
than learning. This is why reach — recorded passively when a lesson page loads —
is the backbone of drop-off and the sole basis for verdicts. The completion
series is still worth showing, because the gap between reaching a lesson and
finishing it is itself diagnostic, but it must stay labelled as self-reported and
must never drive a claim. If automatic completion detection is built later, this
page gets better without changing shape.

**On the cost of the maturity filter.** Excluding cohorts under 30 days old is
correct and it has a real price: a brand-new course shows almost no drop-off data
for its first month, which is precisely when an instructor is most eager to look.
The empty states and the course grid hook must make that read as "we are
gathering data" rather than "this is broken." This is the single most likely
place for the feature to make a bad first impression.

**On sample size as a first-class design constraint.** The platform is small
enough that most courses will sit near or below the verdict threshold for some
time. The response is not to lower the bar but to make the page useful anyway:
charts always render, counts are always available, and the page states clearly
what it does not yet know. An analytics page that is confidently wrong loses an
instructor's trust permanently, whereas one that is visibly patient does not.

**On why the correlation between comments and reach is expressed as a rate.**
The original instinct was to correlate comment volume against reach directly.
That relationship is mechanically confounded — more students reaching a lesson
produces more comments regardless of quality — so a coefficient would come out
strongly positive and mean nothing beyond "earlier lessons have more of
everything." Dividing comments by students reached removes the confound and
turns the signal into something that points at a specific lesson. Any future
revision that reintroduces a raw count comparison would reintroduce the artifact.

**On the two failure modes in drop-off.** Plotting reached and completed as
separate series exists because they demand opposite responses. A lesson few
students reach means the material *before* it is losing people and the fix is
upstream. A lesson many reach but few complete means that lesson is the problem
and the fix is local. Collapsing the chart into a single series would erase that
distinction and remove most of the page's value.

**On the completion divergence during the transition.** Until the enrollment
completion fix and its backfill land, the roster and the analytics page will
disagree about who has finished. The analytics figure is the correct one. This is
why the fix is bundled into this work rather than deferred — a new page whose
headline number contradicts an existing page one click away will be assumed
wrong, however right it is.

**On seed data as a correctness tool.** The planted cliff and the planted comment
spike are not decoration. They are the only way to confirm that worst-lesson
detection and discussion-rate flagging identify the right lesson rather than
merely producing plausible output. Seed data with no known anomalies can make
broken detectors look fine.
