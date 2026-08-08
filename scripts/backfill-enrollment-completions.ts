import { backfillEnrollmentCompletions } from "~/services/enrollmentService";

// ─── Backfill: enrollment completion ───
//
// `enrollments.completedAt` was never written by the application, so students
// who had genuinely finished a course were shown as still in progress. This
// stamps every existing enrollment that already meets the condition, so history
// earned before completion tracking landed is not lost.
//
// Safe to re-run — already-stamped enrollments are skipped.

const { scanned, completed } = backfillEnrollmentCompletions();

console.log(
  `Scanned ${scanned} incomplete enrollment(s); marked ${completed} complete.`
);
