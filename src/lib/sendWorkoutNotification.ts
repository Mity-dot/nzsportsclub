import { supabase } from "@/integrations/supabase/client";

export type WorkoutNotificationRequest = {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full" | "auto_reserved" | "waiting_list_promoted" | "workout_reminder";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string | null;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
};

/**
 * Sends a notification via the unified notification edge function.
 * This handles:
 * - In-app notifications (notification_queue)
 * - Web Push (VAPID)
 * - FCM (native Android/iOS)
 * - OneSignal
 *
 * Never throws (best-effort).
 */
export async function sendWorkoutNotification(body: WorkoutNotificationRequest) {
  try {
    const { data, error } = await supabase.functions.invoke("unified-notification", { body });
    if (error) {
      console.error("Notification error:", error);
    } else {
      console.log("Notification result:", data);
    }
    return data;
  } catch (e) {
    console.error("Failed to send notification:", e);
    return null;
  }
}
