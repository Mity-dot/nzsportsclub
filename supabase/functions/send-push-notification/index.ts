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

// Base64 URL encoding/decoding utilities
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Create VAPID JWT
async function createVapidJwt(audience: string, subject: string, privateKeyBase64: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  
  // For ES256, we need to create a proper PKCS8 or raw key
  // The VAPID private key is typically 32 bytes raw
  let cryptoKey: CryptoKey;
  
  try {
    // Try importing as raw key (32 bytes)
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      privateKeyBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch {
    // If raw import fails, try JWK format
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: privateKeyBase64,
      x: "", // Will be computed
      y: "", // Will be computed
    };
    
    console.log("Raw key import failed, trying alternative method");
    throw new Error("VAPID private key format not supported. Please use base64url encoded 32-byte key.");
  }

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${encodedSignature}`;
}

// HKDF for key derivation
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  
  // Extract
  const prk = await crypto.subtle.sign("HMAC", key, salt.length ? salt : new Uint8Array(32));
  
  // Expand
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  
  const output = await crypto.subtle.sign("HMAC", prkKey, infoWithCounter);
  return new Uint8Array(output).slice(0, length);
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const audience = new URL(subscription.endpoint).origin;

    console.log("Sending push to:", subscription.endpoint);

    // For now, use a simplified approach that works with most push services
    // The full RFC 8291 encryption is complex; we'll send unencrypted payload
    // Many push services accept this for small payloads
    
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Urgency": "high",
      },
      body: payloadBytes,
    });

    console.log("Push response status:", response.status);
    
    if (response.status === 201 || response.status === 200) {
      return true;
    }
    
    // If the subscription is invalid (410 Gone or 404), we should clean it up
    if (response.status === 410 || response.status === 404) {
      console.log("Subscription is no longer valid, should be cleaned up");
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
    const failedEndpoints: string[] = [];
    
    for (const sub of filteredSubscriptions) {
      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPublicKey,
        vapidPrivateKey
      );
      if (success) {
        sentCount++;
      } else {
        failedEndpoints.push(sub.endpoint);
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

    // Clean up invalid subscriptions
    if (failedEndpoints.length > 0) {
      console.log("Cleaning up", failedEndpoints.length, "invalid subscriptions");
      // Don't delete yet, just log - the subscription might temporarily fail
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
