import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// Get OAuth2 access token using service account credentials
async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  // Create JWT header and payload
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: credentials.token_uri,
    iat: now,
    exp: expiry,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  // Base64URL encode
  const base64UrlEncode = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    const base64 = btoa(json);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Parse and import the private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = credentials.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\n/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Send FCM notification using HTTP v1 API
async function sendFCMNotification(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  isNative: boolean = false
): Promise<boolean> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Build message payload based on platform
  const messagePayload: Record<string, unknown> = {
    token: fcmToken,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: data,
  };

  // Add platform-specific config
  if (isNative) {
    // Native Android config
    messagePayload.android = {
      notification: {
        icon: "ic_notification",
        color: "#7C3AED",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        default_vibrate_timings: true,
        default_light_settings: true,
      },
      priority: "high",
    };
    // Native iOS config
    messagePayload.apns = {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    };
  } else {
    // Web push config
    messagePayload.webpush = {
      notification: {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        vibrate: [200, 100, 200],
        requireInteraction: true,
      },
      fcm_options: {
        link: "/dashboard",
      },
    };
  }

  const message = { message: messagePayload };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      console.log(`[✓] FCM notification sent successfully`);
      return true;
    }

    const errorData = await response.json();
    console.error(`[!] FCM error:`, errorData);

    // Check for invalid token errors
    if (errorData.error?.details?.some((d: { errorCode: string }) => 
      d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
    )) {
      return false; // Token is invalid, should be removed
    }

    return true; // Other errors, don't remove token
  } catch (error) {
    console.error("[!] FCM fetch error:", error);
    return true;
  }
}

function getNotificationContent(
  type: string,
  title: string,
  titleBg: string | undefined,
  date: string | undefined,
  time: string | undefined,
  language: string
): { title: string; body: string } {
  const isBg = language === 'bg';
  const displayTitle = isBg && titleBg ? titleBg : title;
  const formattedDate = date || '';
  const formattedTime = time || '';

  switch (type) {
    case "new_workout":
      return {
        title: isBg ? "🏋️ Нова тренировка!" : "🏋️ New Workout Available!",
        body: isBg 
          ? `"${displayTitle}" е добавена за ${formattedDate} в ${formattedTime}. Резервирайте сега!`
          : `"${displayTitle}" has been scheduled for ${formattedDate} at ${formattedTime}. Reserve your spot now!`,
      };
    case "workout_updated":
      return {
        title: isBg ? "📝 Тренировка актуализирана" : "📝 Workout Updated",
        body: isBg 
          ? `Детайлите за "${displayTitle}" бяха променени. Проверете новата информация.`
          : `Details for "${displayTitle}" have been changed. Check the updated information.`,
      };
    case "workout_deleted":
      return {
        title: isBg ? "❌ Тренировка отменена" : "❌ Workout Cancelled",
        body: isBg 
          ? `"${displayTitle}" беше отменена. Резервацията ви е анулирана автоматично.`
          : `"${displayTitle}" has been cancelled. Your reservation has been automatically removed.`,
      };
    case "spot_freed":
      return {
        title: isBg ? "🎉 Освободено място!" : "🎉 Spot Available!",
        body: isBg 
          ? `Свободно място за "${displayTitle}"! Бързайте да резервирате.`
          : `A spot just opened up for "${displayTitle}"! Hurry and reserve it now.`,
      };
    case "workout_full":
      return {
        title: isBg ? "📋 Тренировката е пълна" : "📋 Workout Fully Booked",
        body: isBg 
          ? `"${displayTitle}" вече е напълно заета. Всички места са резервирани.`
          : `"${displayTitle}" is now fully booked. All spots have been reserved.`,
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
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    
    if (!serviceAccountJson) {
      console.error("FIREBASE_SERVICE_ACCOUNT not configured");
      return new Response(
        JSON.stringify({ error: "FCM not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    console.log(`[FCM] Using project: ${credentials.project_id}`);

    // Get OAuth access token
    const accessToken = await getAccessToken(credentials);
    console.log("[FCM] Access token obtained");

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

    console.log("📨 FCM Notification request:", { type, workoutId, workoutTitle });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build query for FCM subscriptions (tokens stored with fcm:// or native:// prefix)
    let subscriptionsQuery = supabase
      .from("push_subscriptions")
      .select("*")
      .or("endpoint.like.fcm://token/%,endpoint.like.native://fcm/%");

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
      console.log("No FCM subscriptions found");
      return new Response(
        JSON.stringify({ message: "No subscriptions to notify", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Filter subscriptions based on criteria
    let filteredSubscriptions = subscriptions;
    
    if (excludeUserIds && excludeUserIds.length > 0) {
      filteredSubscriptions = subscriptions.filter(
        (s) => !excludeUserIds.includes(s.user_id)
      );
    }

    const userIds = filteredSubscriptions.map(s => s.user_id);
    
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, member_type, preferred_language")
      .in("user_id", userIds);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, is_approved")
      .in("user_id", userIds);

    const userLanguages = new Map<string, string>();
    profiles?.forEach(p => {
      userLanguages.set(p.user_id, p.preferred_language || 'en');
    });

    // Apply priority filter
    if (priorityOnly) {
      const cardMemberIds = profiles?.filter(p => p.member_type === "card").map(p => p.user_id) || [];
      filteredSubscriptions = filteredSubscriptions.filter((s) =>
        cardMemberIds.includes(s.user_id)
      );
    }

    // Handle staff notifications
    if (notifyStaff) {
      const staffUserIds = roles?.filter(r => 
        (r.role === "staff" || r.role === "admin") && r.is_approved
      ).map(r => r.user_id) || [];
      
      const { data: staffSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", staffUserIds)
        .or("endpoint.like.fcm://token/%,endpoint.like.native://fcm/%");

      const { data: staffProfiles } = await supabase
        .from("profiles")
        .select("user_id, preferred_language")
        .in("user_id", staffUserIds);
      
      staffProfiles?.forEach(p => {
        userLanguages.set(p.user_id, p.preferred_language || 'en');
      });

      if (staffSubs) {
        const existingEndpoints = new Set(filteredSubscriptions.map(s => s.endpoint));
        for (const sub of staffSubs) {
          if (!existingEndpoints.has(sub.endpoint) && !excludeUserIds?.includes(sub.user_id)) {
            filteredSubscriptions.push(sub);
          }
        }
      }
    }

    // Exclude members if needed
    if (excludeMembers) {
      const staffUserIds = new Set(
        roles?.filter(r => (r.role === "staff" || r.role === "admin") && r.is_approved)
          .map(r => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter(s => staffUserIds.has(s.user_id));
    }

    // Exclude staff from member notifications if not explicitly included
    if (!notifyStaff && !excludeMembers && (type === "new_workout" || type === "workout_updated" || type === "spot_freed")) {
      const staffUserIds = new Set(
        roles?.filter(r => (r.role === "staff" || r.role === "admin") && r.is_approved)
          .map(r => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter(s => !staffUserIds.has(s.user_id));
    }

    console.log(`📤 Sending FCM to ${filteredSubscriptions.length} devices`);

    const expiredTokens: string[] = [];
    let successCount = 0;

    for (const sub of filteredSubscriptions) {
      // Extract FCM token from endpoint
      // Formats: "fcm://token/{token}" (web) or "native://fcm/{token}" (native)
      let fcmToken: string;
      let isNativeToken = false;
      
      if (sub.endpoint.startsWith("native://fcm/")) {
        fcmToken = sub.endpoint.replace("native://fcm/", "");
        isNativeToken = true;
      } else {
        fcmToken = sub.endpoint.replace("fcm://token/", "");
      }
      
      const userLang = userLanguages.get(sub.user_id) || 'en';
      
      const content = getNotificationContent(
        type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, userLang
      );

      const success = await sendFCMNotification(
        accessToken,
        credentials.project_id,
        fcmToken,
        content,
        { workoutId, type },
        isNativeToken
      );

      if (success) {
        successCount++;
      } else {
        expiredTokens.push(sub.id);
      }
    }

    // Delete expired tokens
    if (expiredTokens.length > 0) {
      console.log(`🗑️ Deleting ${expiredTokens.length} invalid FCM tokens`);
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredTokens);
    }

    // Store in notification_queue for in-app display
    const notificationRecords = filteredSubscriptions
      .filter(sub => !expiredTokens.includes(sub.id))
      .map((sub) => {
        const content = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'en');
        const contentBg = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'bg');
        return {
          user_id: sub.user_id,
          workout_id: type === 'workout_deleted' ? null : workoutId,
          notification_type: type,
          message: content.body,
          message_bg: contentBg.body,
          is_sent: true,
          scheduled_for: new Date().toISOString(),
        };
      });

    if (notificationRecords.length > 0) {
      const { error: insertError } = await supabase.from("notification_queue").insert(notificationRecords);
      if (insertError) {
        console.error("Error inserting notification records:", insertError);
      }
    }

    console.log(`✅ FCM sent ${successCount}/${filteredSubscriptions.length} notifications`);

    return new Response(
      JSON.stringify({ 
        message: "FCM Notifications sent", 
        sent: successCount, 
        total: filteredSubscriptions.length,
        expired: expiredTokens.length
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in send-fcm-notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
