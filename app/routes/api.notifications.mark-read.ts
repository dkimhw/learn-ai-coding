import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.mark-read";
import { getCurrentUserId } from "~/lib/session";
import { markAsRead } from "~/services/notificationService";
import { parseJsonBody } from "~/lib/validation";

const markReadSchema = z.object({
  notificationId: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, markReadSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  // Ownership is enforced inside the service by matching on the recipient, so a
  // notification belonging to someone else updates nothing and reads back as
  // "not found" rather than confirming it exists.
  const notification = markAsRead({
    notificationId: parsed.data.notificationId,
    userId: currentUserId,
  });
  if (!notification) {
    throw data("Not found", { status: 404 });
  }

  return { success: true };
}
