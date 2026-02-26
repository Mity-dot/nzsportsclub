import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find workouts starting in the next 2 hours that haven't been reminded yet
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    const todayStr = now.toISOString().split('T')[0];
    const twoHoursDate = twoHoursFromNow.toISOString().split('T')[0];

    // Get workouts happening today or tomorrow (within 2 hour window)
    const { data: workouts, error: workoutsError } = await supabase
      .from("workouts")
      .select("*")
      .gte("workout_date", todayStr)
      .lte("workout_date", twoHoursDate);

    if (workoutsError) {
      console.error("Error fetching workouts:", workoutsError);
      throw workoutsError;
    }

    if (!workouts || workouts.length === 0) {
      console.log("No upcoming workouts found");
      return new Response(
        JSON.stringify({ message: "No upcoming workouts", reminded: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalReminded = 0;

    for (const workout of workouts) {
      // Build the full workout datetime
      const workoutDateTime = new Date(`${workout.workout_date}T${workout.start_time}`);
      const diffMs = workoutDateTime.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Only remind if workout is between 90 and 150 minutes away (roughly 2 hours)
      if (diffMinutes < 90 || diffMinutes > 150) {
        continue;
      }

      // Check if we already sent a reminder for this workout
      const { data: existingReminders } = await supabase
        .from("notification_queue")
        .select("id")
        .eq("workout_id", workout.id)
        .eq("notification_type", "workout_reminder")
        .limit(1);

      if (existingReminders && existingReminders.length > 0) {
        console.log(`Reminder already sent for workout ${workout.id}`);
        continue;
      }

      // Get active reservations for this workout
      const { data: reservations } = await supabase
        .from("reservations")
        .select("user_id")
        .eq("workout_id", workout.id)
        .eq("is_active", true);

      if (!reservations || reservations.length === 0) {
        continue;
      }

      const userIds = reservations.map(r => r.user_id);
      const timeStr = workout.start_time?.slice(0, 5) || '';

      // Get user language preferences
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, preferred_language")
        .in("user_id", userIds);

      // Insert reminder notifications into notification_queue
      const notificationRecords = userIds.map(userId => {
        const lang = profiles?.find(p => p.user_id === userId)?.preferred_language || 'en';
        const isBg = lang === 'bg';
        return {
          user_id: userId,
          workout_id: workout.id,
          notification_type: "workout_reminder",
          message: `⏰ Reminder: "${workout.title}" starts at ${timeStr} today!`,
          message_bg: `⏰ Напомняне: "${workout.title_bg || workout.title}" започва в ${timeStr} днес!`,
          is_sent: true,
          scheduled_for: new Date().toISOString(),
        };
      });

      const { error: insertError } = await supabase
        .from("notification_queue")
        .insert(notificationRecords);

      if (insertError) {
        console.error("Error inserting reminder notifications:", insertError);
        continue;
      }

      // Send push notifications via unified-notification
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/unified-notification`;
        await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            type: "workout_reminder",
            workoutId: workout.id,
            workoutTitle: workout.title,
            workoutTitleBg: workout.title_bg,
            workoutDate: workout.workout_date,
            workoutTime: timeStr,
            targetUserIds: userIds,
          }),
        });
      } catch (e) {
        console.error("Failed to send push reminders:", e);
      }

      totalReminded += userIds.length;
      console.log(`Sent ${userIds.length} reminders for workout ${workout.id}`);
    }

    return new Response(
      JSON.stringify({ message: "Reminders sent", reminded: totalReminded }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-workout-reminders:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
