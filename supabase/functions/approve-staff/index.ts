import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId parameter" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Approve the staff role
    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("role", "staff");
    
    if (roleError) {
      console.error("Error approving staff:", roleError);
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Mark pending approval as processed
    await supabase
      .from("pending_staff_approvals")
      .update({ is_processed: true })
      .eq("user_id", userId);
    
    console.log(`Staff user ${userId} approved successfully`);
    
    // Return a nice HTML page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Staff Approved - NZ Sport Club</title>
          <style>
            body {
              font-family: 'Outfit', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(180deg, #faf8f6 0%, #f5f0ed 100%);
            }
            .card {
              background: white;
              padding: 48px;
              border-radius: 16px;
              box-shadow: 0 8px 24px rgba(232, 196, 184, 0.2);
              text-align: center;
              max-width: 400px;
            }
            h1 {
              font-family: 'Cormorant Garamond', serif;
              color: #2d2520;
              margin-bottom: 16px;
            }
            p {
              color: #6b6158;
              margin-bottom: 24px;
            }
            .success {
              color: #22c55e;
              font-size: 48px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✓</div>
            <h1>Staff Account Approved!</h1>
            <p>The staff member can now access the staff dashboard.</p>
          </div>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { "Content-Type": "text/html", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in approve-staff function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
