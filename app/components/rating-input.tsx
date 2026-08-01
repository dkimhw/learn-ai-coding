import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

/**
 * Interactive 1–5 star rating widget for enrolled students.
 * Each star is a submit button that posts { intent: "rate", rating } to the
 * current route's action via a fetcher. The parent route revalidates on
 * completion, so the persisted rating flows back through `currentRating`.
 */
export function RatingInput({ currentRating }: { currentRating: number | null }) {
  const fetcher = useFetcher();
  const [hovered, setHovered] = useState(0);

  // Optimistically reflect the value being submitted.
  const submitting = fetcher.state !== "idle" && fetcher.formData != null;
  const pending = submitting
    ? Number(fetcher.formData!.get("rating"))
    : null;

  const active = hovered || pending || currentRating || 0;
  const hasRating = currentRating != null;

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        {hasRating ? "Your rating" : "Rate this course"}
      </p>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="rate" />
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="submit"
              name="rating"
              value={star}
              disabled={submitting}
              onMouseEnter={() => setHovered(star)}
              aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
              aria-pressed={currentRating === star}
              className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <Star
                className={cn(
                  "size-7 transition-colors",
                  star <= active
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-muted text-muted-foreground/30"
                )}
              />
            </button>
          ))}
        </div>
      </fetcher.Form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {hasRating
          ? "Tap a star to change your rating."
          : "Tap a star to leave your rating."}
      </p>
    </div>
  );
}
