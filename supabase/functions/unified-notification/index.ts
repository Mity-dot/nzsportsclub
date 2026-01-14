// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full" | "auto_reserved" | "waiting_list_promoted";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string | null;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
}

function getNotificationContent(
  type: string,
  title: string,
  titleBg: string | undefined | null,
  date: string | undefined,
  time: string | undefined,
  language: string
): { title: string; body: string } {
  const isBg = language === 'bg';
  // Use unified title (same for all users)
  const displayTitle = title;
  const formattedDate = date || '';
  const formattedTime = time || '';

  switch (type) {
    case "new_workout":
      return {
        title: isBg ? "🏋️ Нова тренировка в NZ!" : "🏋️ New Workout at NZ!",
        body: isBg 
          ? `"${displayTitle}" е добавена за ${formattedDate} в ${formattedTime}. Резервирайте сега!`
          : `"${displayTitle}" scheduled for ${formattedDate} at ${formattedTime}. Reserve now!`,
      };
    case "auto_reserved":
      return {
        title: isBg ? "🎫 NZ Авто-резервация!" : "🎫 NZ Auto-Reserved!",
        body: isBg 
          ? `Мястото ви за "${displayTitle}" на ${formattedDate} в ${formattedTime} е резервирано.`
          : `Your spot for "${displayTitle}" on ${formattedDate} at ${formattedTime} is reserved.`,
      };
    case "workout_updated":
      return {
        title: isBg ? "📝 NZ Тренировка актуализирана" : "📝 NZ Workout Updated",
        body: isBg 
          ? `Детайлите за "${displayTitle}" бяха променени.`
          : `Details for "${displayTitle}" have been changed.`,
      };
    case "workout_deleted":
      return {
        title: isBg ? "❌ NZ Тренировка отменена" : "❌ NZ Workout Cancelled",
        body: isBg 
          ? `"${displayTitle}" беше отменена.`
          : `"${displayTitle}" has been cancelled.`,
      };
    case "spot_freed":
      return {
        title: isBg ? "🎉 NZ Освободено място!" : "🎉 NZ Spot Available!",
        body: isBg 
          ? `Свободно място за "${displayTitle}"! Резервирайте бързо.`
          : `A spot opened for "${displayTitle}"! Reserve now.`,
      };
    case "workout_full":
      return {
        title: isBg ? "📋 NZ Тренировката е пълна" : "📋 NZ Workout Full",
        body: isBg 
          ? `"${displayTitle}" е напълно заета.`
          : `"${displayTitle}" is fully booked.`,
      };
    case "waiting_list_promoted":
      return {
        title: isBg ? "🎉 NZ Мястото ви е потвърдено!" : "🎉 NZ Spot Confirmed!",
        body: isBg 
          ? `Освободи се място за "${displayTitle}" и вие сте записани!`
          : `A spot opened for "${displayTitle}" and you're in!`,
      };
    default:
      return {
        title: "NZ Sport Club",
        body: displayTitle,
      };
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body: NotificationRequest = await req.json();
    const { 
      type, 
      workoutId, 
      workoutTitle, 
      workoutTitleBg, 
      workoutDate, 
      workoutTime, 
      targetUserIds,
      excludeUserIds
    } = body;

    const targetCount = targetUserIds?.length ?? 0;
    const excludeCount = excludeUserIds?.length ?? 0;
    console.log("📨 Unified Notification request:", { type, workoutId, workoutTitle, targetCount, excludeCount });

    // Determine which users to notify based on notification type
    let userIdsToNotify: string[] = [];

    if (targetUserIds && targetUserIds.length > 0) {
      // Specific users targeted (e.g., auto-reserved members)
      userIdsToNotify = targetUserIds;
      console.log(`Targeting ${targetUserIds.length} specific users`);
    } else {
      // Get all members (non-staff users)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, member_type, preferred_language");

      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"])
        .eq("is_approved", true);

      const staffUserIds = new Set(staffRoles?.map(r => r.user_id) || []);

      // For most notification types, notify all non-staff members
      if (type === "new_workout" || type === "workout_updated" || type === "spot_freed") {
        userIdsToNotify = profiles?.filter(p => !staffUserIds.has(p.user_id)).map(p => p.user_id) || [];
      } else if (type === "workout_deleted") {
        // Notify all members who had reservations (they'll be in excludeUserIds from reservations)
        // For simplicity, notify all members
        userIdsToNotify = profiles?.filter(p => !staffUserIds.has(p.user_id)).map(p => p.user_id) || [];
      } else if (type === "workout_full") {
        // Only notify staff when workout is full
        userIdsToNotify = Array.from(staffUserIds);
      }
    }

    // Apply exclusions
    if (excludeUserIds && excludeUserIds.length > 0) {
      userIdsToNotify = userIdsToNotify.filter(id => !excludeUserIds.includes(id));
    }

    if (userIdsToNotify.length === 0) {
      console.log("No users to notify");
      return new Response(
        JSON.stringify({ message: "No users to notify", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`📤 Notifying ${userIdsToNotify.length} users`);

    // Get user language preferences
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("user_id, preferred_language")
      .in("user_id", userIdsToNotify);

    const userLanguages = new Map<string, string>();
    userProfiles?.forEach(p => {
      userLanguages.set(p.user_id, p.preferred_language || 'en');
    });

    // Insert notification_queue entries (in-app notifications) - only once, not per channel
    const notificationRecords = userIdsToNotify.map(userId => {
      const contentEn = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'en');
      const contentBg = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'bg');
      return {
        user_id: userId,
        workout_id: type === 'workout_deleted' ? null : workoutId,
        notification_type: type,
        message: contentEn.body,
        message_bg: contentBg.body,
        is_sent: true,
        scheduled_for: new Date().toISOString(),
      };
    });

    if (notificationRecords.length > 0) {
      const { error: insertError } = await supabase
        .from("notification_queue")
        .insert(notificationRecords);
      if (insertError) {
        console.error("Error inserting notification records:", insertError);
      } else {
        console.log(`✅ Inserted ${notificationRecords.length} notification_queue records`);
      }
    }

    // Now send push notifications via each channel (without inserting to notification_queue again)
    const pushResults = await Promise.allSettled([
      sendViaWebPush(supabase, userIdsToNotify, userLanguages, body),
      sendViaFCM(supabase, userIdsToNotify, userLanguages, body),
      sendViaOneSignal(userIdsToNotify, body),
    ]);

    const successCounts = pushResults.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      console.error(`Push channel ${i} failed:`, r.reason);
      return 0;
    });

    const totalSent = successCounts.reduce((a, b) => a + b, 0);

    return new Response(
      JSON.stringify({ 
        message: "Notifications sent", 
        notified: userIdsToNotify.length,
        pushSent: totalSent,
        channels: {
          webPush: successCounts[0],
          fcm: successCounts[1],
          oneSignal: successCounts[2],
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in unified-notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

// Send via Web Push (VAPID)
async function sendViaWebPush(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest
): Promise<number> {
  try {
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    
    if (!vapidPrivateKey || !vapidPublicKey) {
      console.log("VAPID keys not configured, skipping web push");
      return 0;
    }

    // Import the push builder
    const { buildPushHTTPRequest } = await import("https://esm.sh/@pushforge/builder@1.1.2?target=denonext");

    // Get web push subscriptions (not FCM or native)
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .not("endpoint", "like", "fcm://token/%")
      .not("endpoint", "like", "native://fcm/%");

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No web push subscriptions found");
      return 0;
    }

    const privateJWK = buildVapidPrivateJwk(vapidPrivateKey.trim(), vapidPublicKey);
    let successCount = 0;

    for (const sub of subscriptions) {
      if (!sub.endpoint?.startsWith("https://")) continue;
      
      const userLang = userLanguages.get(sub.user_id) || 'en';
      const content = getNotificationContent(
        body.type, body.workoutTitle, body.workoutTitleBg, 
        body.workoutDate, body.workoutTime, userLang
      );

      try {
        const { endpoint, headers, body: pushBody } = await buildPushHTTPRequest({
          privateJWK,
          message: {
            payload: {
              title: content.title,
              body: content.body,
              icon: "/favicon.ico",
              badge: "/favicon.ico",
              data: { workoutId: body.workoutId, type: body.type },
            },
            options: { ttl: 60 * 60 * 24, urgency: "high" },
            adminContact: "mailto:nz@sportclub.com",
          },
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
        });

        const resp = await fetch(endpoint, { method: "POST", headers, body: pushBody });
        if (resp.status === 201) successCount++;
      } catch (e) {
        console.error("Web push failed for subscription:", e);
      }
    }

    console.log(`Web Push: sent ${successCount}/${subscriptions.length}`);
    return successCount;
  } catch (e) {
    console.error("Web push error:", e);
    return 0;
  }
}

// Send via FCM
async function sendViaFCM(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest
): Promise<number> {
  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      console.log("FCM not configured, skipping");
      return 0;
    }

    const credentials = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(credentials);

    // Get FCM subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .or("endpoint.like.fcm://token/%,endpoint.like.native://fcm/%");

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No FCM subscriptions found");
      return 0;
    }

    let successCount = 0;

    for (const sub of subscriptions) {
      const isNative = sub.endpoint.startsWith("native://fcm/");
      const fcmToken = isNative 
        ? sub.endpoint.replace("native://fcm/", "")
        : sub.endpoint.replace("fcm://token/", "");
      
      const userLang = userLanguages.get(sub.user_id) || 'en';
      const content = getNotificationContent(
        body.type, body.workoutTitle, body.workoutTitleBg,
        body.workoutDate, body.workoutTime, userLang
      );

      const success = await sendFCMNotification(
        accessToken, credentials.project_id, fcmToken,
        content, { workoutId: body.workoutId, type: body.type }, isNative
      );
      if (success) successCount++;
    }

    console.log(`FCM: sent ${successCount}/${subscriptions.length}`);
    return successCount;
  } catch (e) {
    console.error("FCM error:", e);
    return 0;
  }
}

// Send via OneSignal
async function sendViaOneSignal(userIds: string[], body: NotificationRequest): Promise<number> {
  try {
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    
    if (!appId || !apiKey) {
      console.log("OneSignal not configured, skipping");
      return 0;
    }

    const content = getNotificationContent(
      body.type, body.workoutTitle, body.workoutTitleBg,
      body.workoutDate, body.workoutTime, 'en'
    );

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: userIds,
        headings: { en: content.title },
        contents: { en: content.body },
        data: { type: body.type, workoutId: body.workoutId },
      }),
    });

    const result = await response.json();
    console.log("OneSignal response:", result);
    
    return result.recipients || 0;
  } catch (e) {
    console.error("OneSignal error:", e);
    return 0;
  }
}

// Helper functions for VAPID/FCM
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function buildVapidPrivateJwk(vapidPrivateKeySecret: string, vapidPublicKey: string): JsonWebKey {
  const trimmed = vapidPrivateKeySecret.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed) as JsonWebKey;
  }
  const pub = base64UrlToUint8Array(vapidPublicKey);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY must be uncompressed P-256 key");
  }
  const x = uint8ArrayToBase64Url(pub.slice(1, 33));
  const y = uint8ArrayToBase64Url(pub.slice(33, 65));
  return { alg: "ES256", kty: "EC", crv: "P-256", x, y, d: trimmed };
}

async function getAccessToken(credentials: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const base64UrlEncode = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${unsignedToken}.${signatureB64}`;
  const tokenResponse = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${await tokenResponse.text()}`);
  }

  return (await tokenResponse.json()).access_token;
}

async function sendFCMNotification(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  isNative: boolean
): Promise<boolean> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const messagePayload: Record<string, unknown> = {
    token: fcmToken,
    notification,
    data,
  };

  if (isNative) {
    messagePayload.android = {
      notification: { icon: "ic_notification", color: "#7C3AED" },
      priority: "high",
    };
    messagePayload.apns = { payload: { aps: { sound: "default", badge: 1 } } };
  } else {
    messagePayload.webpush = {
      notification: { icon: "/favicon.ico", badge: "/favicon.ico" },
      fcm_options: { link: "/dashboard" },
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: messagePayload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

serve(handler);
