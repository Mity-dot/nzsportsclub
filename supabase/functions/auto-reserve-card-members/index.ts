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

    console.log("Auto-reserving card members for workout:", workoutId);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    // Get all card members who don't already have a reservation
    const { data: cardMembers } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("member_type", "card");

    if (!cardMembers || cardMembers.length === 0) {
      console.log("No card members found");
      return new Response(
        JSON.stringify({ message: "No card members found", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const cardMemberIds = cardMembers.map(m => m.user_id);

    // Get existing reservations for these card members
    const { data: existingReservations } = await supabase
      .from("reservations")
      .select("user_id")
      .eq("workout_id", workoutId)
      .in("user_id", cardMemberIds);

    const alreadyReservedIds = new Set(existingReservations?.map(r => r.user_id) || []);
    
    // Filter out members who already have reservations
    const membersToReserve = cardMemberIds.filter(id => !alreadyReservedIds.has(id));

    // Limit to available spots
    const membersToReserveSlice = membersToReserve.slice(0, availableSpots);

    if (membersToReserveSlice.length === 0) {
      console.log("All card members already have reservations or no card members to reserve");
      return new Response(
        JSON.stringify({ message: "All card members already reserved", reserved: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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

    console.log(`Auto-reserved ${membersToReserveSlice.length} spots for card members`);

    // Send notifications to reserved card members
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          type: "new_workout",
          workoutId: workout.id,
          workoutTitle: `[Auto-reserved] ${workout.title}`,
          workoutTitleBg: workout.title_bg ? `[Автоматична резервация] ${workout.title_bg}` : undefined,
          workoutDate: workout.workout_date,
          workoutTime: workout.start_time?.slice(0, 5),
          targetUserIds: membersToReserveSlice,
        }),
      });
    } catch (e) {
      console.log("Failed to send notifications:", e);
    }

    return new Response(
      JSON.stringify({ 
        message: "Auto-reserved spots for card members", 
        reserved: membersToReserveSlice.length 
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
