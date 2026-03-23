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

    // Check caller is staff or admin
    const { data: isStaff } = await supabase.rpc("is_staff_or_admin", { _user_id: caller.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get soft-deleted profiles (removed_at IS NOT NULL)
    const { data: softDeleted } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, removed_at, member_type")
      .not("removed_at", "is", null)
      .order("removed_at", { ascending: false });

    // 2. Get all auth users and find ones with no profile (hard-deleted)
    const { data: { users: allAuthUsers }, error: authListError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authListError) {
      console.error("Error listing auth users:", authListError);
    }

    // Get all profile user_ids
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id");

    const profileUserIds = new Set((allProfiles || []).map((p: any) => p.user_id));

    // Find auth users with no profile at all (hard-deleted from profiles)
    const hardDeleted = (allAuthUsers || [])
      .filter((u: any) => !profileUserIds.has(u.id))
      .map((u: any) => ({
        user_id: u.id,
        full_name: u.user_metadata?.full_name || null,
        email: u.email || "Unknown",
        removed_at: u.updated_at || u.created_at,
        member_type: u.user_metadata?.member_type || "regular",
        is_hard_deleted: true,
      }));

    // Combine results
    const removedUsers = [
      ...(softDeleted || []).map((p: any) => ({ ...p, is_hard_deleted: false })),
      ...hardDeleted,
    ];

    return new Response(JSON.stringify({ users: removedUsers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
