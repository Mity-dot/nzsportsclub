// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full" | "auto_reserved" | "waiting_list_promoted" | "workout_reminder";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string | null;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
}

interface PushResult {
  channel: string;
  sent: number;
  failed: number;
  errors: string[];
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
    case "workout_reminder":
      return {
        title: isBg ? "⏰ NZ Напомняне" : "⏰ NZ Reminder",
        body: isBg 
          ? `"${displayTitle}" започва в ${formattedTime} днес!`
          : `"${displayTitle}" starts at ${formattedTime} today!`,
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
      userIdsToNotify = targetUserIds;
      console.log(`Targeting ${targetUserIds.length} specific users`);
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, member_type, preferred_language");

      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"])
        .eq("is_approved", true);

      const staffUserIds = new Set(staffRoles?.map(r => r.user_id) || []);

      if (type === "new_workout" || type === "workout_updated" || type === "spot_freed" || type === "workout_reminder") {
        userIdsToNotify = profiles?.filter(p => !staffUserIds.has(p.user_id)).map(p => p.user_id) || [];
      } else if (type === "workout_deleted") {
        userIdsToNotify = profiles?.filter(p => !staffUserIds.has(p.user_id)).map(p => p.user_id) || [];
      } else if (type === "workout_full") {
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

    // Insert notification_queue entries (in-app notifications)
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

    // Send push notifications via each channel with retry logic
    const pushResults = await Promise.allSettled([
      sendViaWebPushWithRetry(supabase, userIdsToNotify, userLanguages, body),
      sendViaFCMv1(supabase, userIdsToNotify, userLanguages, body),
      sendViaOneSignalV2(userIdsToNotify, userLanguages, body),
    ]);

    const results: PushResult[] = [
      { channel: 'webPush', sent: 0, failed: 0, errors: [] },
      { channel: 'fcm', sent: 0, failed: 0, errors: [] },
      { channel: 'oneSignal', sent: 0, failed: 0, errors: [] },
    ];

    pushResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        results[i] = r.value;
      } else {
        results[i].errors.push(String(r.reason));
        console.error(`Push channel ${results[i].channel} failed:`, r.reason);
      }
    });

    const totalSent = results.reduce((a, b) => a + b.sent, 0);

    return new Response(
      JSON.stringify({ 
        message: "Notifications sent", 
        notified: userIdsToNotify.length,
        pushSent: totalSent,
        channels: results.reduce((acc, r) => ({ ...acc, [r.channel]: { sent: r.sent, failed: r.failed } }), {}),
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

// Web Push with retry logic (RFC 8030 compliant)
async function sendViaWebPushWithRetry(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest,
  maxRetries = 2
): Promise<PushResult> {
  const result: PushResult = { channel: 'webPush', sent: 0, failed: 0, errors: [] };
  
  try {
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    
    if (!vapidPrivateKey || !vapidPublicKey) {
      console.log("VAPID keys not configured, skipping web push");
      return result;
    }

    const { buildPushHTTPRequest } = await import("https://esm.sh/@pushforge/builder@1.1.2?target=denonext");

    // Get web push subscriptions (exclude FCM tokens)
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .not("endpoint", "like", "fcm://token/%")
      .not("endpoint", "like", "native://fcm/%");

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No web push subscriptions found");
      return result;
    }

    const privateJWK = buildVapidPrivateJwk(vapidPrivateKey.trim(), vapidPublicKey);
    const expiredSubscriptions: string[] = [];

    for (const sub of subscriptions) {
      if (!sub.endpoint?.startsWith("https://")) continue;
      
      const userLang = userLanguages.get(sub.user_id) || 'en';
      const content = getNotificationContent(
        body.type, body.workoutTitle, body.workoutTitleBg, 
        body.workoutDate, body.workoutTime, userLang
      );

      let success = false;
      let lastError = '';

      for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
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
              options: { 
                ttl: 60 * 60 * 24, // 24 hours
                urgency: "high",
              },
              adminContact: "mailto:nz@sportclub.com",
            },
            subscription: {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
          });

          const resp = await fetch(endpoint, { method: "POST", headers, body: pushBody });
          
          if (resp.status === 201) {
            success = true;
            result.sent++;
          } else if (resp.status === 410 || resp.status === 404) {
            // Subscription expired - mark for deletion
            expiredSubscriptions.push(sub.id);
            lastError = `Subscription expired (${resp.status})`;
            break;
          } else if (resp.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = parseInt(resp.headers.get('Retry-After') || '5');
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            lastError = 'Rate limited';
          } else {
            lastError = `HTTP ${resp.status}`;
          }
        } catch (e) {
          lastError = String(e);
          // Exponential backoff for network errors
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          }
        }
      }

      if (!success) {
        result.failed++;
        if (lastError) result.errors.push(lastError);
      }
    }

    // Clean up expired subscriptions
    if (expiredSubscriptions.length > 0) {
      console.log(`🗑️ Removing ${expiredSubscriptions.length} expired web push subscriptions`);
      await supabase.from("push_subscriptions").delete().in("id", expiredSubscriptions);
    }

    console.log(`Web Push: sent ${result.sent}/${subscriptions.length}`);
    return result;
  } catch (e) {
    console.error("Web push error:", e);
    result.errors.push(String(e));
    return result;
  }
}

// FCM HTTP v1 API (current standard, replaces legacy API)
async function sendViaFCMv1(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest
): Promise<PushResult> {
  const result: PushResult = { channel: 'fcm', sent: 0, failed: 0, errors: [] };
  
  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      console.log("FCM not configured, skipping");
      return result;
    }

    const credentials = JSON.parse(serviceAccountJson);
    const accessToken = await getOAuth2AccessToken(credentials);

    // Get FCM subscriptions (both web and native)
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .or("endpoint.like.fcm://token/%,endpoint.like.native://fcm/%");

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No FCM subscriptions found");
      return result;
    }

    const invalidTokens: string[] = [];

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

      try {
        // FCM HTTP v1 API format
        const fcmPayload = {
          message: {
            token: fcmToken,
            notification: {
              title: content.title,
              body: content.body,
            },
            data: {
              workoutId: body.workoutId || '',
              type: body.type,
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
            android: {
              priority: "high",
              notification: {
                channel_id: "nz_workouts",
                icon: "ic_notification",
                color: "#4F46E5",
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
                "apns-push-type": "alert",
              },
              payload: {
                aps: {
                  alert: {
                    title: content.title,
                    body: content.body,
                  },
                  sound: "default",
                  badge: 1,
                },
              },
            },
            webpush: {
              headers: {
                Urgency: "high",
                TTL: "86400",
              },
              notification: {
                title: content.title,
                body: content.body,
                icon: "/favicon.ico",
                badge: "/favicon.ico",
                requireInteraction: true,
              },
            },
          },
        };

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(fcmPayload),
          }
        );

        if (response.ok) {
          result.sent++;
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorCode = errorData?.error?.details?.[0]?.errorCode || errorData?.error?.code;
          
          // Handle invalid/expired tokens
          if (errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT") {
            invalidTokens.push(sub.id);
          }
          
          result.failed++;
          result.errors.push(`FCM error: ${errorCode || response.status}`);
        }
      } catch (e) {
        result.failed++;
        result.errors.push(String(e));
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      console.log(`🗑️ Removing ${invalidTokens.length} invalid FCM tokens`);
      await supabase.from("push_subscriptions").delete().in("id", invalidTokens);
    }

    console.log(`FCM: sent ${result.sent}/${subscriptions.length}`);
    return result;
  } catch (e) {
    console.error("FCM error:", e);
    result.errors.push(String(e));
    return result;
  }
}

// OneSignal API v2 (User Model - current standard)
async function sendViaOneSignalV2(
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest
): Promise<PushResult> {
  const result: PushResult = { channel: 'oneSignal', sent: 0, failed: 0, errors: [] };
  
  try {
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    
    if (!appId || !apiKey) {
      console.log("OneSignal not configured, skipping");
      return result;
    }

    // Group users by language for localized notifications
    const enUsers: string[] = [];
    const bgUsers: string[] = [];
    
    userIds.forEach(id => {
      const lang = userLanguages.get(id) || 'en';
      if (lang === 'bg') {
        bgUsers.push(id);
      } else {
        enUsers.push(id);
      }
    });

    const contentEn = getNotificationContent(
      body.type, body.workoutTitle, body.workoutTitleBg,
      body.workoutDate, body.workoutTime, 'en'
    );
    
    const contentBg = getNotificationContent(
      body.type, body.workoutTitle, body.workoutTitleBg,
      body.workoutDate, body.workoutTime, 'bg'
    );

    // Send to English users
    if (enUsers.length > 0) {
      const enResult = await sendOneSignalBatch(appId, apiKey, enUsers, contentEn, body);
      result.sent += enResult.sent;
      result.failed += enResult.failed;
      if (enResult.error) result.errors.push(enResult.error);
    }

    // Send to Bulgarian users
    if (bgUsers.length > 0) {
      const bgResult = await sendOneSignalBatch(appId, apiKey, bgUsers, contentBg, body);
      result.sent += bgResult.sent;
      result.failed += bgResult.failed;
      if (bgResult.error) result.errors.push(bgResult.error);
    }

    console.log(`OneSignal: sent ${result.sent}/${userIds.length}`);
    return result;
  } catch (e) {
    console.error("OneSignal error:", e);
    result.errors.push(String(e));
    return result;
  }
}

async function sendOneSignalBatch(
  appId: string,
  apiKey: string,
  userIds: string[],
  content: { title: string; body: string },
  body: NotificationRequest
): Promise<{ sent: number; failed: number; error?: string }> {
  try {
    // OneSignal API - using include_aliases (v2 User Model)
    // This replaces deprecated include_external_user_ids
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        // Use include_aliases with external_id (new User Model API)
        include_aliases: {
          external_id: userIds,
        },
        target_channel: "push",
        headings: { en: content.title },
        contents: { en: content.body },
        data: { 
          type: body.type, 
          workoutId: body.workoutId,
        },
        // iOS specific
        ios_badgeType: "Increase",
        ios_badgeCount: 1,
        ios_sound: "default",
        // Android specific
        android_channel_id: "nz_workouts",
        priority: 10,
        // Web specific
        web_push_topic: body.type,
        chrome_web_icon: "/favicon.ico",
        chrome_web_badge: "/favicon.ico",
        // TTL
        ttl: 86400,
      }),
    });

    const responseData = await response.json();
    
    if (response.ok) {
      return { 
        sent: responseData.recipients || userIds.length, 
        failed: 0 
      };
    } else {
      console.error("OneSignal API error:", responseData);
      return { 
        sent: 0, 
        failed: userIds.length, 
        error: responseData.errors?.[0] || `HTTP ${response.status}` 
      };
    }
  } catch (e) {
    return { sent: 0, failed: userIds.length, error: String(e) };
  }
}

// Helper functions
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

// OAuth2 for FCM HTTP v1 API (replaces legacy server key auth)
async function getOAuth2AccessToken(credentials: { 
  client_email: string; 
  private_key: string; 
  token_uri: string 
}): Promise<string> {
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

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(handler);
