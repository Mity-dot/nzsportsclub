import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");
    
    // Validate userId format
    if (!userId || !UUID_REGEX.test(userId)) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Validate token format
    if (!token || !UUID_REGEX.test(token)) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Verify the token matches the pending approval record
    const { data: pendingApproval, error: approvalError } = await supabase
      .from("pending_staff_approvals")
      .select("id, user_id, approval_token, is_processed")
      .eq("user_id", userId)
      .eq("approval_token", token)
      .eq("is_processed", false)
      .single();
    
    if (approvalError || !pendingApproval) {
      console.error("Invalid or expired approval token");
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invalid Request - NZ Sport Club</title>
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
              .error {
                color: #ef4444;
                font-size: 48px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="error">✕</div>
              <h1>Invalid or Expired Request</h1>
              <p>This approval link is invalid or has already been used.</p>
            </div>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: { "Content-Type": "text/html", ...corsHeaders },
        }
      );
    }
    
    // Approve the staff role
    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("role", "staff");
    
    if (roleError) {
      console.error("Error approving staff role");
      return new Response(
        JSON.stringify({ error: "Failed to process request" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Mark pending approval as processed
    await supabase
      .from("pending_staff_approvals")
      .update({ is_processed: true })
      .eq("id", pendingApproval.id);
    
    console.log("Staff approval processed successfully");
    
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
    console.error("Error in approve-staff function");
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
