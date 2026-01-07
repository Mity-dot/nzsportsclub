// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushHTTPRequest } from "https://esm.sh/@pushforge/builder@1.1.2?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  [key: string]: unknown;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

interface NotificationRequest {
  type:
    | "new_workout"
    | "workout_updated"
    | "workout_deleted"
    | "spot_freed"
    | "workout_full";
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

function buildVapidPrivateJwk(
  vapidPrivateKeySecret: string,
  vapidPublicKey: string
): JsonWebKey {
  const trimmed = vapidPrivateKeySecret.trim();

  // Preferred: store private key as JSON JWK (what PushForge CLI outputs)
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const jwk = JSON.parse(trimmed) as JsonWebKey;
    if (!jwk.kty || !jwk.crv || !jwk.d) {
      throw new Error("VAPID_PRIVATE_KEY JWK missing required fields");
    }
    return jwk;
  }

  // Back-compat: store private key as base64url raw 32 bytes + public key as base64url uncompressed point
  const pub = base64UrlToUint8Array(vapidPublicKey);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY must be uncompressed P-256 key (65 bytes, starts with 0x04)");
  }

  const x = uint8ArrayToBase64Url(pub.slice(1, 33));
  const y = uint8ArrayToBase64Url(pub.slice(33, 65));

  return {
    alg: "ES256",
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: trimmed,
  };
}

function isValidEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && endpoint.startsWith("https://");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPrivateKeySecret = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Backend not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!vapidPrivateKeySecret || !vapidPublicKey) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "Push notifications not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const privateJWK = buildVapidPrivateJwk(vapidPrivateKeySecret, vapidPublicKey);

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
      excludeMembers,
    } = body;

    console.log("📨 Notification request:", {
      type,
      workoutId,
      workoutTitle,
      notifyStaff: !!notifyStaff,
      excludeMembers: !!excludeMembers,
      priorityOnly: !!priorityOnly,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
      filteredSubscriptions = filteredSubscriptions.filter(
        (s) => !excludeUserIds.includes(s.user_id)
      );
    }

    const userIds = filteredSubscriptions.map((s) => s.user_id);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, member_type, preferred_language")
      .in("user_id", userIds);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, is_approved")
      .in("user_id", userIds);

    const userLanguages = new Map<string, string>();
    profiles?.forEach((p) => {
      userLanguages.set(p.user_id, p.preferred_language || "en");
    });

    // If priorityOnly, filter to only card members
    if (priorityOnly) {
      const cardMemberIds =
        profiles
          ?.filter((p) => p.member_type === "card")
          .map((p) => p.user_id) || [];
      filteredSubscriptions = filteredSubscriptions.filter((s) =>
        cardMemberIds.includes(s.user_id)
      );
    }

    // If notifyStaff, also include staff subscriptions
    if (notifyStaff) {
      const staffUserIds =
        roles
          ?.filter(
            (r) =>
              (r.role === "staff" || r.role === "admin") && r.is_approved
          )
          .map((r) => r.user_id) || [];

      const { data: staffSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", staffUserIds);

      const { data: staffProfiles } = await supabase
        .from("profiles")
        .select("user_id, preferred_language")
        .in("user_id", staffUserIds);

      staffProfiles?.forEach((p) => {
        userLanguages.set(p.user_id, p.preferred_language || "en");
      });

      if (staffSubs) {
        const existingEndpoints = new Set(
          filteredSubscriptions.map((s) => s.endpoint)
        );
        for (const sub of staffSubs) {
          if (
            !existingEndpoints.has(sub.endpoint) &&
            !excludeUserIds?.includes(sub.user_id)
          ) {
            filteredSubscriptions.push(sub);
          }
        }
      }
    }

    // excludeMembers => keep only staff/admin
    if (excludeMembers) {
      const staffUserIds = new Set(
        roles
          ?.filter(
            (r) =>
              (r.role === "staff" || r.role === "admin") && r.is_approved
          )
          .map((r) => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter((s) =>
        staffUserIds.has(s.user_id)
      );
    }

    // If not notifyStaff and this is a member notification, exclude staff
    if (
      !notifyStaff &&
      !excludeMembers &&
      (type === "new_workout" ||
        type === "workout_updated" ||
        type === "spot_freed")
    ) {
      const staffUserIds = new Set(
        roles
          ?.filter(
            (r) =>
              (r.role === "staff" || r.role === "admin") && r.is_approved
          )
          .map((r) => r.user_id) || []
      );
      filteredSubscriptions = filteredSubscriptions.filter(
        (s) => !staffUserIds.has(s.user_id)
      );
    }

    // Only allow valid push endpoints
    filteredSubscriptions = filteredSubscriptions.filter((s) => {
      if (!isValidEndpoint(s.endpoint)) {
        console.log(`Skipping invalid endpoint: ${String(s.endpoint)}`);
        return false;
      }
      return true;
    });

    console.log(`📤 Sending to ${filteredSubscriptions.length} subscriptions`);

    // Insert in-app notifications first (so they still show even if push fails)
    const notificationRecords = filteredSubscriptions.map((sub) => ({
      user_id: sub.user_id,
      workout_id: type === "workout_deleted" ? null : workoutId,
      notification_type: type,
      message: getPayload(
        type,
        workoutTitle,
        workoutTitleBg,
        workoutDate,
        workoutTime,
        workoutId,
        "en"
      ).body,
      message_bg: getPayload(
        type,
        workoutTitle,
        workoutTitleBg,
        workoutDate,
        workoutTime,
        workoutId,
        "bg"
      ).body,
      is_sent: true,
      scheduled_for: new Date().toISOString(),
    }));

    if (notificationRecords.length > 0) {
      const { error: insertError } = await supabase
        .from("notification_queue")
        .insert(notificationRecords);
      if (insertError) {
        console.error("Error inserting notification records:", insertError);
      }
    }

    const expiredSubscriptions: string[] = [];
    let successCount = 0;

    for (const sub of filteredSubscriptions) {
      const userLang = userLanguages.get(sub.user_id) || "en";
      const payload = getPayload(
        type,
        workoutTitle,
        workoutTitleBg,
        workoutDate,
        workoutTime,
        workoutId,
        userLang
      );

      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          message: {
            payload: payload as unknown as Record<string, unknown>,
            options: {
              ttl: 60 * 60 * 24,
              urgency: "high",
            },
            adminContact: "mailto:nz@sportclub.com",
          },
          subscription,
        });

        const resp = await fetch(endpoint, {
          method: "POST",
          headers,
          body,
        });

        if (resp.status === 201) {
          successCount++;
          continue;
        }

        const text = await resp.text().catch(() => "");
        console.log(`[!] Push response: ${resp.status} ${text}`);

        if (resp.status === 410 || resp.status === 404) {
          expiredSubscriptions.push(sub.id);
        }
      } catch (e) {
        console.error("Push send failed:", e);
        // If build/encrypt fails, keep subscription (don't delete) and continue.
      }
    }

    if (expiredSubscriptions.length > 0) {
      console.log(`🗑️ Deleting ${expiredSubscriptions.length} expired subscriptions`);
      await supabase.from("push_subscriptions").delete().in("id", expiredSubscriptions);
    }

    console.log(`✅ Sent ${successCount}/${filteredSubscriptions.length} notifications`);

    return new Response(
      JSON.stringify({
        message: "Notifications processed",
        sent: successCount,
        total: filteredSubscriptions.length,
        expired: expiredSubscriptions.length,
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
  const isBg = language === "bg";
  const displayTitle = isBg && titleBg ? titleBg : title;
  const formattedDate = date || "";
  const formattedTime = time || "";

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
