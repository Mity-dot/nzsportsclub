import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "new_workout" | "workout_updated" | "workout_deleted" | "spot_freed" | "workout_full" | "auto_reserved" | "waiting_list_promoted" | "workout_reminder" | "member_booked" | "member_cancelled";
  workoutId: string;
  workoutTitle: string;
  workoutTitleBg?: string | null;
  workoutDate?: string;
  workoutTime?: string;
  targetUserIds?: string[];
  excludeUserIds?: string[];
  memberName?: string;
}

function getNotificationContent(
  type: string,
  title: string,
  titleBg: string | undefined | null,
  date: string | undefined,
  time: string | undefined,
  language: string,
  memberName?: string
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
    case "member_booked":
      return {
        title: isBg ? "📗 NZ Нова резервация" : "📗 NZ New Booking",
        body: isBg 
          ? `${memberName || 'Член'} резервира място за "${displayTitle}" ${formattedDate ? `на ${formattedDate}` : ''} ${formattedTime ? `в ${formattedTime}` : ''}`
          : `${memberName || 'Member'} booked a spot for "${displayTitle}" ${formattedDate ? `on ${formattedDate}` : ''} ${formattedTime ? `at ${formattedTime}` : ''}`,
      };
    case "member_cancelled":
      return {
        title: isBg ? "📕 NZ Отказана резервация" : "📕 NZ Booking Cancelled",
        body: isBg 
          ? `${memberName || 'Член'} отказа резервация за "${displayTitle}" ${formattedDate ? `на ${formattedDate}` : ''} ${formattedTime ? `в ${formattedTime}` : ''}`
          : `${memberName || 'Member'} cancelled their booking for "${displayTitle}" ${formattedDate ? `on ${formattedDate}` : ''} ${formattedTime ? `at ${formattedTime}` : ''}`,
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
    const { type, workoutId, workoutTitle, workoutTitleBg, workoutDate, workoutTime, targetUserIds, excludeUserIds, memberName } = body;

    console.log("📨 Notification request:", { type, workoutId, workoutTitle, memberName, targetCount: targetUserIds?.length ?? 0 });

    // Determine which users to notify
    let userIdsToNotify: string[] = [];

    if (targetUserIds && targetUserIds.length > 0) {
      userIdsToNotify = targetUserIds;
    } else {
      const { data: profiles } = await supabase.from("profiles").select("user_id");
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"])
        .eq("is_approved", true);

      const staffUserIds = new Set(staffRoles?.map(r => r.user_id) || []);

      if (type === "workout_full" || type === "member_booked" || type === "member_cancelled") {
        // Staff-only notifications
        userIdsToNotify = Array.from(staffUserIds);
      } else {
        userIdsToNotify = profiles?.filter(p => !staffUserIds.has(p.user_id)).map(p => p.user_id) || [];
      }
    }

    if (excludeUserIds && excludeUserIds.length > 0) {
      userIdsToNotify = userIdsToNotify.filter(id => !excludeUserIds.includes(id));
    }

    if (userIdsToNotify.length === 0) {
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
    userProfiles?.forEach(p => userLanguages.set(p.user_id, p.preferred_language || 'en'));

    // 1. Insert in-app notifications
    const notificationRecords = userIdsToNotify.map(userId => {
      const contentEn = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'en', memberName);
      const contentBg = getNotificationContent(type, workoutTitle, workoutTitleBg, workoutDate, workoutTime, 'bg', memberName);
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

    const { error: insertError } = await supabase.from("notification_queue").insert(notificationRecords);
    if (insertError) console.error("Error inserting notifications:", insertError);
    else console.log(`✅ Inserted ${notificationRecords.length} in-app notifications`);

    // 2. Send push via OneSignal
    const oneSignalResult = await sendViaOneSignal(userIdsToNotify, userLanguages, body);

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        notified: userIdsToNotify.length,
        oneSignal: { sent: oneSignalResult.sent, failed: oneSignalResult.failed },
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

async function sendViaOneSignal(
  userIds: string[],
  userLanguages: Map<string, string>,
  body: NotificationRequest
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const result = { sent: 0, failed: 0, errors: [] as string[] };

  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!appId || !apiKey) {
    console.log("OneSignal not configured, skipping push");
    return result;
  }

  // Group users by language
  const enUsers: string[] = [];
  const bgUsers: string[] = [];
  userIds.forEach(id => {
    if ((userLanguages.get(id) || 'en') === 'bg') bgUsers.push(id);
    else enUsers.push(id);
  });

  const contentEn = getNotificationContent(body.type, body.workoutTitle, body.workoutTitleBg, body.workoutDate, body.workoutTime, 'en', body.memberName);
  const contentBg = getNotificationContent(body.type, body.workoutTitle, body.workoutTitleBg, body.workoutDate, body.workoutTime, 'bg', body.memberName);

  // Send to each language group
  for (const [users, content] of [[enUsers, contentEn], [bgUsers, contentBg]] as [string[], { title: string; body: string }][]) {
    if (users.length === 0) continue;

    try {
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          include_aliases: { external_id: users },
          target_channel: "push",
          headings: { en: content.title },
          contents: { en: content.body },
          data: { type: body.type, workoutId: body.workoutId },
          // Unique topic per type+workout so different notifications don't replace each other
          web_push_topic: `${body.type}_${body.workoutId}`,
          collapse_id: `${body.type}_${body.workoutId}`,
          ios_badgeType: "Increase",
          ios_badgeCount: 1,
          ios_sound: "default",
          priority: 10,
          chrome_web_icon: "/favicon.ico",
          chrome_web_badge: "/favicon.ico",
          ttl: 86400,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        result.sent += data.recipients || users.length;
        console.log(`✅ OneSignal sent to ${data.recipients || users.length} users`);
      } else {
        result.failed += users.length;
        result.errors.push(data.errors?.[0] || `HTTP ${response.status}`);
        console.error("OneSignal error:", data);
      }
    } catch (e) {
      result.failed += users.length;
      result.errors.push(String(e));
    }
  }

  return result;
}

serve(handler);
