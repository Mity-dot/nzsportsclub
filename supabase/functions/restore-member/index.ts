import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is staff/admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isStaff } = await supabase.rpc("is_staff_or_admin", { _user_id: caller.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, isHardDeleted } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isHardDeleted) {
      // Hard-deleted: recreate profile from auth user data
      const { data: { user: authUser }, error: getUserError } = await supabase.auth.admin.getUserById(userId);
      if (getUserError || !authUser) {
        return new Response(JSON.stringify({ error: "Auth user not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Recreate profile
      const { error: insertError } = await supabase.from("profiles").insert({
        user_id: authUser.id,
        email: authUser.email || "",
        full_name: authUser.user_metadata?.full_name || "",
        member_type: "regular",
        removed_at: null,
      });

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add member role
      await supabase.from("user_roles").insert({
        user_id: authUser.id,
        role: "member",
        is_approved: true,
      });

      return new Response(JSON.stringify({ success: true, restored: "hard_deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Soft-deleted: clear removed_at and re-add role
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ removed_at: null })
        .eq("user_id", userId);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Re-add member role
      await supabase.from("user_roles").insert({
        user_id: userId,
        role: "member",
        is_approved: true,
      });

      return new Response(JSON.stringify({ success: true, restored: "soft_deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
