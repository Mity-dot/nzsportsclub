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
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
  priorityOnly?: boolean;
  notifyStaff?: boolean;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    console.log("Sending push to:", subscription.endpoint);

    // Send a simple push notification
    // Note: For production, you'd want to use proper VAPID auth and encryption
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": "86400",
      },
      body: JSON.stringify(payload),
    });

    console.log("Push response status:", response.status);
    
    if (response.status === 201 || response.status === 200) {
      return true;
    }
    
    if (response.status === 410 || response.status === 404) {
      console.log("Subscription is no longer valid");
      return false;
    }

    const responseText = await response.text();
    console.log("Push response:", responseText);
    
    return false;
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      notifyStaff 
    } = body;

    console.log("Received notification request:", { type, workoutId, workoutTitle, notifyStaff });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    // If not notifyStaff and this is a member notification, exclude staff
    if (!notifyStaff && (type === "new_workout" || type === "workout_updated" || type === "spot_freed")) {
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
      default:
        payload = {
          title: "NZ Sport Club",
          body: workoutTitle,
          icon: "/favicon.ico",
          data: { workoutId, type },
        };
    }

    // Queue notifications in the database for tracking
    const notificationRecords = filteredSubscriptions.map((sub) => ({
      user_id: sub.user_id,
      workout_id: workoutId,
      notification_type: type,
      message: payload.body,
      message_bg: getMessageBg(type, workoutTitleBg || workoutTitle, workoutDate, workoutTime),
      is_sent: false,
      scheduled_for: new Date().toISOString(),
    }));

    if (notificationRecords.length > 0) {
      await supabase.from("notification_queue").insert(notificationRecords);
    }

    // Send push notifications
    let sentCount = 0;
    
    for (const sub of filteredSubscriptions) {
      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      );
      if (success) {
        sentCount++;
      }
    }

    // Mark notifications as sent
    if (filteredSubscriptions.length > 0) {
      await supabase
        .from("notification_queue")
        .update({ is_sent: true })
        .eq("workout_id", workoutId)
        .eq("notification_type", type)
        .in("user_id", filteredSubscriptions.map((s) => s.user_id));
    }

    console.log(`Sent ${sentCount}/${filteredSubscriptions.length} push notifications`);

    return new Response(
      JSON.stringify({ 
        message: "Notifications sent", 
        sent: sentCount, 
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
    default:
      return title;
  }
}

serve(handler);
