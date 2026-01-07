import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

interface NotificationRequest {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
  priorityOnly?: boolean;
  notifyStaff?: boolean;
  excludeMembers?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const body: NotificationRequest = await req.json();
    const { 
      type, 
      workoutId, 
      workoutTitle, 
      workoutTitleBg, 
      workoutDate, 
      workoutTime, 
      targetUserIds, 
      excludeUserIds, 
      priorityOnly,
      notifyStaff,
      excludeMembers
    } = body;

    console.log("Received notification request:", { type, workoutId, workoutTitle, notifyStaff, excludeMembers });

    const supabase = createClient(
      supabaseUrl!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build the query for push subscriptions
    let subscriptionsQuery = supabase.from("push_subscriptions").select("*");

    if (targetUserIds && targetUserIds.length > 0) {
      subscriptionsQuery = subscriptionsQuery.in("user_id", targetUserIds);
    }

    const { data: subscriptions, error: subError } = await subscriptionsQuery;

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No subscriptions found");
      return new Response(
        JSON.stringify({ message: "No subscriptions to notify", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Filter out excluded users
    let filteredSubscriptions = subscriptions;
    if (excludeUserIds && excludeUserIds.length > 0) {
      filteredSubscriptions = subscriptions.filter(
        (s) => !excludeUserIds.includes(s.user_id)
      );
    }

    // Get all user roles and profiles for filtering
    const userIds = filteredSubscriptions.map(s => s.user_id);
    
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, member_type")
      .in("user_id", userIds);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, is_approved")
      .in("user_id", userIds);

    // If priorityOnly, filter to only card members
    if (priorityOnly) {
      const cardMemberIds = profiles?.filter(p => p.member_type === "card").map(p => p.user_id) || [];
      filteredSubscriptions = filteredSubscriptions.filter((s) =>
        cardMemberIds.includes(s.user_id)
      );
    }

    // If notifyStaff, also include staff subscriptions
    if (notifyStaff) {
      const staffUserIds = roles?.filter(r => 
        (r.role === "staff" || r.role === "admin") && r.is_approved
      ).map(r => r.user_id) || [];
      
      // Get staff subscriptions that weren't already included
      const { data: staffSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", staffUserIds);
      
      if (staffSubs) {
        const existingEndpoints = new Set(filteredSubscriptions.map(s => s.endpoint));
        for (const sub of staffSubs) {
          if (!existingEndpoints.has(sub.endpoint) && !excludeUserIds?.includes(sub.user_id)) {
            filteredSubscriptions.push(sub);
          }
        }
      }
    }

    // If excludeMembers is true, only keep staff subscriptions
    if (excludeMembers) {
      const staffUserIds = new Set(
        roles?.filter(r => (r.role === "staff" || r.role === "admin") && r.is_approved)
          .map(r => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter(s => staffUserIds.has(s.user_id));
    }

    // If not notifyStaff and this is a member notification, exclude staff
    if (!notifyStaff && !excludeMembers && (type === "new_workout" || type === "workout_updated" || type === "spot_freed")) {
      const staffUserIds = new Set(
        roles?.filter(r => (r.role === "staff" || r.role === "admin") && r.is_approved)
          .map(r => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter(s => !staffUserIds.has(s.user_id));
    }

    // Prepare notification payload based on type
    let payload: PushPayload;
    switch (type) {
      case "new_workout":
        payload = {
          title: "New Workout Added! 🏋️",
          body: `${workoutTitle} on ${workoutDate} at ${workoutTime}`,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
        break;
      case "workout_updated":
        payload = {
          title: "Workout Updated 📝",
          body: `${workoutTitle} has been updated`,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
        break;
      case "workout_deleted":
        payload = {
          title: "Workout Cancelled ❌",
          body: `${workoutTitle} has been cancelled`,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
        break;
      case "spot_freed":
        payload = {
          title: "Spot Available! 🎉",
          body: `A spot just opened up for ${workoutTitle}`,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
        break;
      case "workout_full":
        payload = {
          title: "Workout Full! 📋",
          body: `${workoutTitle} is now fully booked`,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
        break;
      default:
        payload = {
          title: "NZ Sport Club",
          body: workoutTitle,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
    }

    // Queue notifications in the database for tracking and in-app display
    const notificationRecords = filteredSubscriptions.map((sub) => ({
      user_id: sub.user_id,
      workout_id: workoutId,
      notification_type: type,
      message: payload.body,
      message_bg: getMessageBg(type, workoutTitleBg || workoutTitle, workoutDate, workoutTime),
      is_sent: true, // Mark as sent since we're storing them
      scheduled_for: new Date().toISOString(),
    }));

    if (notificationRecords.length > 0) {
      const { error: insertError } = await supabase.from("notification_queue").insert(notificationRecords);
      if (insertError) {
        console.error("Error inserting notifications:", insertError);
      }
    }

    console.log(`Queued ${filteredSubscriptions.length} notifications for ${type}`);

    return new Response(
      JSON.stringify({ 
        message: "Notifications queued", 
        sent: filteredSubscriptions.length, 
        total: filteredSubscriptions.length
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in send-push-notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

function getMessageBg(type: string, title: string, date?: string, time?: string): string {
  switch (type) {
    case "new_workout":
      return `${title} на ${date} в ${time}`;
    case "workout_updated":
      return `${title} беше актуализирана`;
    case "workout_deleted":
      return `${title} беше отменена`;
    case "spot_freed":
      return `Освободи се място за ${title}`;
    case "workout_full":
      return `${title} е напълно резервирана`;
    default:
      return title;
  }
}

serve(handler);
