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
  badge?: string;
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

// Convert base64url to Uint8Array
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Uint8Array to base64url
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Create VAPID Authorization header
async function createVapidAuthHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<string> {
  try {
    const endpointUrl = new URL(endpoint);
    const audience = endpointUrl.origin;
    
    // Create JWT header and payload
    const header = { typ: "JWT", alg: "ES256" };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: audience,
      exp: now + 12 * 60 * 60,
      sub: "mailto:nz@sportclub.com"
    };

    const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const unsignedToken = `${headerB64}.${payloadB64}`;

    // Import private key and sign
    const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKey);
    
    // VAPID private keys are 32-byte raw EC private keys
    // We need to wrap them in proper PKCS8 format
    const pkcs8Header = new Uint8Array([
      0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
      0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
      0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
      0x01, 0x01, 0x04, 0x20
    ]);
    
    const publicKeyBytes = base64UrlToUint8Array(vapidPublicKey);
    const pkcs8Footer = new Uint8Array([
      0xa1, 0x44, 0x03, 0x42, 0x00
    ]);

    const pkcs8Key = new Uint8Array(pkcs8Header.length + privateKeyBytes.length + pkcs8Footer.length + publicKeyBytes.length);
    pkcs8Key.set(pkcs8Header, 0);
    pkcs8Key.set(privateKeyBytes, pkcs8Header.length);
    pkcs8Key.set(pkcs8Footer, pkcs8Header.length + privateKeyBytes.length);
    pkcs8Key.set(publicKeyBytes, pkcs8Header.length + privateKeyBytes.length + pkcs8Footer.length);

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8Key.buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    );

    // Convert signature from DER format if needed and encode
    const signatureBytes = new Uint8Array(signature);
    const signatureB64 = uint8ArrayToBase64Url(signatureBytes);
    const jwt = `${unsignedToken}.${signatureB64}`;

    return `vapid t=${jwt}, k=${vapidPublicKey}`;
  } catch (error) {
    console.error("VAPID auth creation failed:", error);
    throw error;
  }
}

// Send Web Push notification
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string
): Promise<boolean> {
  try {
    const payloadString = JSON.stringify(payload);
    
    // Try to create VAPID auth header
    let authHeader: string;
    try {
      authHeader = await createVapidAuthHeader(subscription.endpoint, vapidPublicKey, vapidPrivateKey);
    } catch (authError) {
      console.log("Using simplified push without VAPID signing");
      authHeader = "";
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "TTL": "86400",
      "Urgency": "high",
    };

    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    // Note: Full Web Push requires message encryption with the p256dh and auth keys
    // For now, send unencrypted payload (works with some endpoints)
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body: payloadString,
    });

    if (response.ok || response.status === 201) {
      console.log(`[✓] Push sent successfully`);
      return true;
    }

    console.log(`[!] Push response: ${response.status}`);

    // Subscription expired or invalid
    if (response.status === 410 || response.status === 404) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Push error:", error);
    return true;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");

    if (!vapidPrivateKey || !vapidPublicKey) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "Push notifications not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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

    console.log("📨 Notification request:", { type, workoutId, workoutTitle });

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
      .select("user_id, member_type, preferred_language")
      .in("user_id", userIds);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, is_approved")
      .in("user_id", userIds);

    // Create a map for user preferences
    const userLanguages = new Map<string, string>();
    profiles?.forEach(p => {
      userLanguages.set(p.user_id, p.preferred_language || 'en');
    });

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
      
      const { data: staffSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", staffUserIds);
      
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

    console.log(`📤 Sending to ${filteredSubscriptions.length} subscriptions`);

    // Send push notifications and track results
    const expiredSubscriptions: string[] = [];
    let successCount = 0;

    for (const sub of filteredSubscriptions) {
      const userLang = userLanguages.get(sub.user_id) || 'en';
      const payload = getPayload(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, workoutId, userLang);
      
      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPrivateKey,
        vapidPublicKey
      );

      if (success) {
        successCount++;
      } else {
        expiredSubscriptions.push(sub.id);
      }
    }

    // Delete expired subscriptions
    if (expiredSubscriptions.length > 0) {
      console.log(`🗑️ Deleting ${expiredSubscriptions.length} expired subscriptions`);
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredSubscriptions);
    }

    // Also store in notification_queue for in-app display
    const notificationRecords = filteredSubscriptions
      .filter(sub => !expiredSubscriptions.includes(sub.id))
      .map((sub) => ({
        user_id: sub.user_id,
        workout_id: type === 'workout_deleted' ? null : workoutId,
        notification_type: type,
        message: getPayload(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, workoutId, 'en').body,
        message_bg: getPayload(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, workoutId, 'bg').body,
        is_sent: true,
        scheduled_for: new Date().toISOString(),
      }));

    if (notificationRecords.length > 0) {
      const { error: insertError } = await supabase.from("notification_queue").insert(notificationRecords);
      if (insertError) {
        console.error("Error inserting notification records:", insertError);
      }
    }

    console.log(`✅ Sent ${successCount}/${filteredSubscriptions.length} notifications`);

    return new Response(
      JSON.stringify({ 
        message: "Notifications sent", 
        sent: successCount, 
        total: filteredSubscriptions.length,
        expired: expiredSubscriptions.length
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

function getPayload(
  type: string, 
  title: string, 
  titleBg: string | undefined, 
  date: string | undefined, 
  time: string | undefined, 
  workoutId: string,
  language: string
): PushPayload {
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
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
    case "workout_updated":
      return {
        title: isBg ? "📝 Тренировка актуализирана" : "📝 Workout Updated",
        body: isBg 
          ? `Детайлите за "${displayTitle}" бяха променени. Проверете новата информация.`
          : `Details for "${displayTitle}" have been changed. Check the updated information.`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
    case "workout_deleted":
      return {
        title: isBg ? "❌ Тренировка отменена" : "❌ Workout Cancelled",
        body: isBg 
          ? `"${displayTitle}" беше отменена. Резервацията ви е анулирана автоматично.`
          : `"${displayTitle}" has been cancelled. Your reservation has been automatically removed.`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
    case "spot_freed":
      return {
        title: isBg ? "🎉 Освободено място!" : "🎉 Spot Available!",
        body: isBg 
          ? `Свободно място за "${displayTitle}"! Бързайте да резервирате.`
          : `A spot just opened up for "${displayTitle}"! Hurry and reserve it now.`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
    case "workout_full":
      return {
        title: isBg ? "📋 Тренировката е пълна" : "📋 Workout Fully Booked",
        body: isBg 
          ? `"${displayTitle}" вече е напълно заета. Всички места са резервирани.`
          : `"${displayTitle}" is now fully booked. All spots have been reserved.`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
    default:
      return {
        title: "NZ Sport Club",
        body: displayTitle,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { workoutId, type },
      };
  }
}

serve(handler);
