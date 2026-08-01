import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const SIZES = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

const TEXT_SIZES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-sm",
} as const;

function Stars({
  size,
  filled,
}: {
  size: keyof typeof SIZES;
  filled: boolean;
}) {
  return (
    <span className="flex">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={cn(
            "shrink-0",
            SIZES[size],
            filled
              ? "fill-yellow-400 text-yellow-400"
              : "fill-muted text-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

/**
 * Read-only average star display with partial fill (e.g. 4.3 → 4.3/5 stars).
 * Shows "★★★★☆ 4.3 (12)" when there are ratings, or "No ratings yet" when count is 0.
 */
export function StarRating({
  value,
  count,
  size = "sm",
  showCount = true,
  className,
}: {
  value: number;
  count: number;
  size?: keyof typeof SIZES;
  showCount?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const fillPercent = (clamped / 5) * 100;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-muted-foreground",
        TEXT_SIZES[size],
        className
      )}
    >
      <span
        className="relative inline-flex"
        role="img"
        aria-label={
          count > 0
            ? `Rated ${clamped.toFixed(1)} out of 5 stars from ${count} ${count === 1 ? "review" : "reviews"}`
            : "No ratings yet"
        }
      >
        <Stars size={size} filled={false} />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${fillPercent}%` }}
        >
          <Stars size={size} filled />
        </span>
      </span>
      {showCount &&
        (count > 0 ? (
          <span>
            <span className="font-medium text-foreground">
              {clamped.toFixed(1)}
            </span>{" "}
            ({count})
          </span>
        ) : (
          <span>No ratings yet</span>
        ))}
    </span>
  );
}
