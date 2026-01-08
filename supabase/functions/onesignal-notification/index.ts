import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error("Missing OneSignal credentials");
      return new Response(
        JSON.stringify({ error: "OneSignal not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: NotificationRequest = await req.json();
    console.log("Received notification request:", JSON.stringify(body));

    const { type, workoutId, workoutTitle, workoutTitleBg, workoutDate, workoutTime, targetUserIds, excludeUserIds, priorityOnly, notifyStaff, excludeMembers } = body;

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build user filter query
    let userIds: string[] = [];

    if (targetUserIds && targetUserIds.length > 0) {
      // Use specified target users
      userIds = targetUserIds;
    } else if (notifyStaff && excludeMembers) {
      // Only notify staff (for workout_full notifications)
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"])
        .eq("is_approved", true);

      userIds = staffRoles?.map(r => r.user_id) || [];
      console.log(`Found ${userIds.length} staff users to notify`);
    } else {
      // Get members to notify based on criteria
      let query = supabase.from("profiles").select("user_id, member_type, preferred_language");

      if (priorityOnly) {
        query = query.eq("member_type", "card");
      }

      const { data: profiles, error: profilesError } = await query;

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }

      // Get staff user IDs to exclude from member notifications
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"])
        .eq("is_approved", true);

      const staffIds = new Set(staffRoles?.map(r => r.user_id) || []);
      
      // Only include non-staff profiles (members)
      userIds = profiles?.filter(p => !staffIds.has(p.user_id)).map(p => p.user_id) || [];
      console.log(`Found ${userIds.length} member users to notify`);

      // Optionally add staff
      if (notifyStaff) {
        userIds = [...new Set([...userIds, ...Array.from(staffIds)])];
      }
    }

    // Apply exclusions
    if (excludeUserIds && excludeUserIds.length > 0) {
      userIds = userIds.filter(id => !excludeUserIds.includes(id));
    }

    if (userIds.length === 0) {
      console.log("No users to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No users to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending notification to ${userIds.length} users`);

    // Build notification content based on type
    const getNotificationContent = (type: string, lang: string = "en") => {
      const isBg = lang === "bg";
      const title = isBg && workoutTitleBg ? workoutTitleBg : workoutTitle;
      const dateStr = workoutDate ? ` - ${workoutDate}` : "";
      const timeStr = workoutTime ? ` at ${workoutTime}` : "";

      switch (type) {
        case "new_workout":
          return {
            headings: { en: isBg ? "Нова тренировка" : "New Workout" },
            contents: { en: isBg ? `${title}${dateStr}${timeStr}` : `${title}${dateStr}${timeStr}` },
          };
        case "workout_updated":
          return {
            headings: { en: isBg ? "Тренировката е актуализирана" : "Workout Updated" },
            contents: { en: isBg ? `${title} беше обновена` : `${title} has been updated` },
          };
        case "workout_deleted":
          return {
            headings: { en: isBg ? "Тренировката е отменена" : "Workout Cancelled" },
            contents: { en: isBg ? `${title} беше отменена` : `${title} has been cancelled` },
          };
        case "spot_freed":
          return {
            headings: { en: isBg ? "Освободи се място!" : "Spot Available!" },
            contents: { en: isBg ? `Място се освободи за ${title}` : `A spot opened up for ${title}` },
          };
        case "workout_full":
          return {
            headings: { en: isBg ? "Тренировката е пълна" : "Workout Full" },
            contents: { en: isBg ? `${title} вече е запълнена` : `${title} is now full` },
          };
        default:
          return {
            headings: { en: "NZ Sports Club" },
            contents: { en: title },
          };
      }
    };

    const content = getNotificationContent(type);

    // Send notification via OneSignal
    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: userIds,
      ...content,
      data: {
        type,
        workoutId,
      },
      web_url: `${Deno.env.get("SITE_URL") || "https://nzsportsclub.lovable.app"}/dashboard`,
    };

    console.log("Sending to OneSignal:", JSON.stringify(notificationPayload));

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();
    console.log("OneSignal response:", JSON.stringify(result));

    if (!response.ok) {
      console.error("OneSignal error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send notification", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in onesignal-notification function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
