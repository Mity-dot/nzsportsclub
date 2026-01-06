import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  type: "new_workout" | "spot_freed";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[]; // If not provided, notify all subscribed users
  excludeUserIds?: string[]; // Users to exclude (e.g., the one who cancelled)
  priorityOnly?: boolean; // Only notify card members (for priority period)
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    // Create the JWT for VAPID
    const encoder = new TextEncoder();
    const header = { alg: "ES256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      aud: new URL(subscription.endpoint).origin,
      exp: now + 12 * 60 * 60,
      sub: "mailto:nzsportclub@example.com",
    };

    // For a complete implementation, you would use a proper web-push library
    // This is a simplified version that logs the notification
    console.log("Would send push notification:", {
      endpoint: subscription.endpoint,
      payload,
    });

    // For now, we'll use a fetch request to the push service
    // In production, you'd use proper VAPID signing
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok && response.status !== 201) {
      console.log(`Push failed with status ${response.status}`);
      return false;
    }

    return true;
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
    const { type, workoutId, workoutTitle, workoutTitleBg, workoutDate, workoutTime, targetUserIds, excludeUserIds, priorityOnly } = body;

    console.log("Received notification request:", { type, workoutId, workoutTitle });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get VAPID keys
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "Push notifications not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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

    // If priorityOnly, filter to only card members
    if (priorityOnly) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, member_type")
        .eq("member_type", "card");

      const cardMemberIds = profiles?.map((p) => p.user_id) || [];
      filteredSubscriptions = filteredSubscriptions.filter((s) =>
        cardMemberIds.includes(s.user_id)
      );
    }

    // Prepare notification payload based on type
    let payload: PushPayload;
    if (type === "new_workout") {
      payload = {
        title: "New Workout Added! 🏋️",
        body: `${workoutTitle} on ${workoutDate} at ${workoutTime}`,
        icon: "/favicon.ico",
        data: { workoutId, type },
      };
    } else if (type === "spot_freed") {
      payload = {
        title: "Spot Available! 🎉",
        body: `A spot just opened up for ${workoutTitle}`,
        icon: "/favicon.ico",
        data: { workoutId, type },
      };
    } else {
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
      message_bg: type === "new_workout" 
        ? `${workoutTitleBg || workoutTitle} на ${workoutDate} в ${workoutTime}`
        : `Освободи се място за ${workoutTitleBg || workoutTitle}`,
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
        payload,
        vapidPublicKey,
        vapidPrivateKey
      );
      if (success) sentCount++;
    }

    // Mark notifications as sent
    await supabase
      .from("notification_queue")
      .update({ is_sent: true })
      .eq("workout_id", workoutId)
      .eq("notification_type", type)
      .in("user_id", filteredSubscriptions.map((s) => s.user_id));

    console.log(`Sent ${sentCount} push notifications`);

    return new Response(
      JSON.stringify({ message: "Notifications sent", sent: sentCount }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in send-push-notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
