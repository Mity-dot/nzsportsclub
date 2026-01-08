import { supabase } from "@/integrations/supabase/client";

export type WorkoutNotificationRequest = {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string | null;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
  priorityOnly?: boolean;
  notifyStaff?: boolean;
  excludeMembers?: boolean;
};

/**
 * Sends a notification to:
 * - native devices via FCM
 * - installed PWAs/browsers via standard Web Push
 * - OneSignal web push
 *
 * Never throws (best-effort).
 */
export async function sendWorkoutNotification(body: WorkoutNotificationRequest) {
  await Promise.allSettled([
    supabase.functions.invoke("send-fcm-notification", { body }),
    supabase.functions.invoke("send-push-notification", { body }),
    supabase.functions.invoke("onesignal-notification", { body }),
  ]);
}
