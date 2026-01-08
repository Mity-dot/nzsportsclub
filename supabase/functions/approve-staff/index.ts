import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const action = url.searchParams.get("action") || "approve";
    
    // Validate userId format
    if (!userId || !UUID_REGEX.test(userId)) {
      return renderErrorPage("Invalid request - missing or invalid user ID");
    }
    
    // Validate token format
    if (!token || !UUID_REGEX.test(token)) {
      return renderErrorPage("Invalid request - missing or invalid token");
    }

    // Validate action
    if (action !== "approve" && action !== "deny") {
      return renderErrorPage("Invalid action");
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Verify the token matches the pending approval record
    const { data: pendingApproval, error: approvalError } = await supabase
      .from("pending_staff_approvals")
      .select("id, user_id, approval_token, is_processed, full_name, email")
      .eq("user_id", userId)
      .eq("approval_token", token)
      .eq("is_processed", false)
      .single();
    
    if (approvalError || !pendingApproval) {
      console.error("Invalid or expired approval token:", approvalError);
      return renderErrorPage("This approval link is invalid or has already been used.");
    }

    if (action === "approve") {
      // Approve the staff role
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("role", "staff");
      
      if (roleError) {
        console.error("Error approving staff role:", roleError);
        return renderErrorPage("Failed to approve staff account. Please try again.");
      }
      
      // Mark pending approval as processed
      await supabase
        .from("pending_staff_approvals")
        .update({ is_processed: true })
        .eq("id", pendingApproval.id);
      
      console.log("Staff approval processed successfully for:", pendingApproval.email);
      
      return renderSuccessPage(
        "Staff Account Approved!",
        `${pendingApproval.full_name || pendingApproval.email} can now access the staff dashboard.`,
        "#22c55e"
      );
    } else {
      // Deny - change role from staff to member
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "staff");
      
      if (deleteError) {
        console.error("Error deleting staff role:", deleteError);
      }

      // Add member role instead
      const { error: memberError } = await supabase
        .from("user_roles")
        .upsert({
          user_id: userId,
          role: "member",
          is_approved: true,
          approved_at: new Date().toISOString()
        }, { onConflict: "user_id,role" });
      
      if (memberError) {
        console.error("Error adding member role:", memberError);
      }
      
      // Mark pending approval as processed
      await supabase
        .from("pending_staff_approvals")
        .update({ is_processed: true })
        .eq("id", pendingApproval.id);
      
      console.log("Staff request denied, user set as member:", pendingApproval.email);
      
      return renderSuccessPage(
        "Staff Request Denied",
        `${pendingApproval.full_name || pendingApproval.email} has been set as a regular member instead.`,
        "#f59e0b"
      );
    }
  } catch (error: any) {
    console.error("Error in approve-staff function:", error);
    return renderErrorPage("An unexpected error occurred. Please try again.");
  }
};

function renderSuccessPage(title: string, message: string, color: string): Response {
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - NZ Sport Club</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
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
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 16px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 24px;
            line-height: 1.6;
          }
          .icon {
            color: ${color};
            font-size: 64px;
            margin-bottom: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: { "Content-Type": "text/html", ...corsHeaders },
    }
  );
}

function renderErrorPage(message: string): Response {
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error - NZ Sport Club</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
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
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 16px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 24px;
            line-height: 1.6;
          }
          .icon {
            color: #ef4444;
            font-size: 64px;
            margin-bottom: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✕</div>
          <h1>Something Went Wrong</h1>
          <p>${message}</p>
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

serve(handler);
