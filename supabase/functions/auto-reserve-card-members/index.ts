import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoReserveRequest {
  workoutId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AutoReserveRequest = await req.json();
    const { workoutId } = body;

    console.log("🎫 Auto-reserving card members for workout:", workoutId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get workout details
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", workoutId)
      .single();

    if (workoutError || !workout) {
      console.error("Workout not found:", workoutError);
      return new Response(
        JSON.stringify({ error: "Workout not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if card priority is enabled
    if (!workout.card_priority_enabled) {
      console.log("Card priority not enabled for this workout");
      return new Response(
        JSON.stringify({ message: "Card priority not enabled", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if auto-reserve is enabled
    if (!workout.auto_reserve_enabled) {
      console.log("Auto-reserve not enabled for this workout");
      return new Response(
        JSON.stringify({ message: "Auto-reserve not enabled", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get existing reservations count
    const { count: existingCount } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("workout_id", workoutId)
      .eq("is_active", true);

    const availableSpots = workout.max_spots - (existingCount || 0);
    
    if (availableSpots <= 0) {
      console.log("No available spots");
      return new Response(
        JSON.stringify({ message: "No available spots", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get workout type (early/late)
    const workoutType = workout.workout_type || 'early';
    console.log(`Workout type: ${workoutType}`);

    // Get all card members who have auto-reserve enabled
    const { data: cardMembers } = await supabase
      .from("profiles")
      .select("user_id, preferred_workout_type, auto_reserve_enabled")
      .eq("member_type", "card")
      .eq("auto_reserve_enabled", true);

    if (!cardMembers || cardMembers.length === 0) {
      console.log("No card members with auto-reserve enabled found");
      return new Response(
        JSON.stringify({ message: "No card members with auto-reserve enabled", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${cardMembers.length} card members with auto-reserve enabled`);

    // Filter to only include members whose preference matches the workout type
    // Members with NULL preference get auto-reserved for ALL workout types
    // Members with a specific preference only get auto-reserved for matching types
    const eligibleCardMembers = cardMembers.filter(m => {
      // If member has no preference (null), auto-reserve for all types
      if (m.preferred_workout_type === null || m.preferred_workout_type === undefined) {
        console.log(`Member ${m.user_id}: no preference, eligible for all types`);
        return true;
      }
      // If member has a specific preference, check if it matches
      const matches = m.preferred_workout_type === workoutType;
      console.log(`Member ${m.user_id}: prefers ${m.preferred_workout_type}, workout is ${workoutType}, eligible: ${matches}`);
      return matches;
    });

    console.log(`${eligibleCardMembers.length} members eligible for ${workoutType} workout`);

    if (eligibleCardMembers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No eligible card members for this workout type", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const cardMemberIds = eligibleCardMembers.map(m => m.user_id);

    // Get existing reservations for these card members (including cancelled ones to check)
    const { data: existingReservations } = await supabase
      .from("reservations")
      .select("user_id, is_active")
      .eq("workout_id", workoutId)
      .in("user_id", cardMemberIds);

    const alreadyReservedIds = new Set(
      existingReservations?.filter(r => r.is_active).map(r => r.user_id) || []
    );
    
    // Filter out members who already have active reservations
    const membersToReserve = cardMemberIds.filter(id => !alreadyReservedIds.has(id));

    // Limit to available spots
    const membersToReserveSlice = membersToReserve.slice(0, availableSpots);

    if (membersToReserveSlice.length === 0) {
      console.log("All eligible card members already have reservations");
      return new Response(
        JSON.stringify({ message: "All eligible card members already reserved", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Creating reservations for ${membersToReserveSlice.length} card members`);

    // Create reservations for card members
    const reservations = membersToReserveSlice.map(userId => ({
      workout_id: workoutId,
      user_id: userId,
      is_active: true,
    }));

    const { error: insertError } = await supabase
      .from("reservations")
      .insert(reservations);

    if (insertError) {
      console.error("Error creating reservations:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create reservations" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`✅ Auto-reserved ${membersToReserveSlice.length} spots for card members`);

    // Mark workout as auto_reserve_executed
    await supabase
      .from("workouts")
      .update({ auto_reserve_executed: true })
      .eq("id", workoutId);

    // Send notifications to auto-reserved members via unified notification
    try {
      await fetch(`${supabaseUrl}/functions/v1/unified-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          type: "auto_reserved",
          workoutId: workout.id,
          workoutTitle: workout.title,
          workoutTitleBg: workout.title_bg,
          workoutDate: workout.workout_date,
          workoutTime: workout.start_time?.slice(0, 5),
          targetUserIds: membersToReserveSlice,
        }),
      });
      console.log("Sent auto-reserve notifications");
    } catch (e) {
      console.log("Failed to send auto-reserve notifications:", e);
    }

    return new Response(
      JSON.stringify({ 
        message: "Auto-reserved spots for card members", 
        reserved: membersToReserveSlice.length,
        workoutType: workoutType,
        eligibleMembers: eligibleCardMembers.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in auto-reserve:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
