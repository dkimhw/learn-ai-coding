import {
  CircleAlert,
  CircleCheck,
  Receipt,
  TicketCheck,
  Tickets,
  Users,
  Wallet,
} from "lucide-react";
import { StatTile } from "~/components/stat-tile";
import type {
  CourseCompletionSummary,
  CourseRevenueSummary,
} from "~/services/analyticsService";
import { formatPrice } from "~/lib/utils";

// ─── KPI tiles ───
// The instructor's bearings: how big the audience is, how it is landing, and
// what it collected. Shared verbatim between one course and all of them,
// because every figure here is a sum or a rate over the pooled 100% band and
// means the same thing at either scope.

/**
 * `formatPrice` renders 0 as "Free", which is right on a course card and wrong
 * on a revenue tile — "Gross collected: Free" reads as a pricing statement
 * rather than an amount. A course that has collected nothing collected $0.00.
 */
function formatCollected(cents: number) {
  return cents === 0 ? "$0.00" : formatPrice(cents);
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function AnalyticsKpiTiles({
  completion,
  revenue,
  scope,
}: {
  completion: CourseCompletionSummary;
  revenue: CourseRevenueSummary;
  /** Wording only: pooled figures have to say they span courses. */
  scope: "course" | "all-courses";
}) {
  const unredeemedSeats = revenue.seatsSold - revenue.seatsRedeemed;
  const isPooled = scope === "all-courses";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        icon={Users}
        label={isPooled ? "Enrollments" : "Students enrolled"}
        value={completion.enrolled}
        context={
          isPooled
            ? "Places taken across your courses — one person in two courses is two"
            : "People with access, however they got it"
        }
      />
      <StatTile
        icon={CircleCheck}
        label="Completion rate"
        value={completion.rate === null ? "—" : `${completion.rate}%`}
        context={
          completion.rate === null
            ? "No students yet"
            : // Deliberately the pooled 100% band over pooled enrollments, not
              // the average of each course's rate: averaging would let a course
              // with three students swing the headline as hard as one with sixty.
              `${completion.completed} of ${completion.enrolled} finished every lesson`
        }
      />
      <StatTile
        icon={Wallet}
        label="Gross collected"
        value={formatCollected(revenue.grossCollected)}
        context="Before any fees — what students actually paid"
      />
      <StatTile
        icon={Receipt}
        label="Sales"
        value={revenue.saleCount}
        context="Purchases, not students — one team deal is a single sale"
      />
      <StatTile
        icon={Tickets}
        label="Team seats sold"
        value={revenue.seatsSold}
        context={
          revenue.seatsSold === 0
            ? "No team purchases yet"
            : `${pluralize(revenue.seatsSold, "Coupon", "Coupons")} issued to teams buying in bulk`
        }
      />
      {unredeemedSeats > 0 ? (
        <StatTile
          icon={CircleAlert}
          emphasis="attention"
          label="Team seats unredeemed"
          value={unredeemedSeats}
          context={`Paid for but never claimed — ${revenue.seatsRedeemed} of ${revenue.seatsSold} redeemed. Chase the team admin.`}
        />
      ) : (
        <StatTile
          icon={TicketCheck}
          label="Team seats redeemed"
          value={revenue.seatsRedeemed}
          context={
            revenue.seatsSold === 0
              ? "No team seats to redeem"
              : "Every seat sold has been claimed"
          }
        />
      )}
    </div>
  );
}
