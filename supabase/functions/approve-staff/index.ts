import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Action = "approve" | "deny";

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");
    const action = (url.searchParams.get("action") || "approve") as Action;
    const confirm = url.searchParams.get("confirm") === "1";

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

    // IMPORTANT: Email clients & link scanners often prefetch GET links.
    // We only perform the approval/denial once the user explicitly confirms via POST.
    if (req.method === "GET" && !confirm) {
      return renderConfirmPage({
        userId,
        token,
        action,
      });
    }

    if (req.method !== "POST") {
      return renderErrorPage("Invalid request method");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch record (even if already processed) so we can show a friendly message on refresh.
    const { data: pendingApproval, error: approvalError } = await supabase
      .from("pending_staff_approvals")
      .select("id, user_id, approval_token, is_processed, full_name, email")
      .eq("user_id", userId)
      .eq("approval_token", token)
      .single();

    if (approvalError || !pendingApproval) {
      console.error("Invalid approval token:", approvalError);
      return renderErrorPage("This approval link is invalid.");
    }

    if (pendingApproval.is_processed) {
      return renderInfoPage(
        "Already Processed",
        "This staff approval request has already been processed."
      );
    }

    if (action === "approve") {
      // Approve the staff role (update first, then fallback to insert)
      const { data: updatedRows, error: roleUpdateError } = await supabase
        .from("user_roles")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("role", "staff")
        .select("id");

      if (roleUpdateError) {
        console.error("Error approving staff role (update):", roleUpdateError);
        return renderErrorPage("Failed to approve staff account. Please try again.");
      }

      if (!updatedRows || updatedRows.length === 0) {
        const { error: roleInsertError } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: "staff",
          is_approved: true,
          approved_at: new Date().toISOString(),
        });

        if (roleInsertError) {
          console.error("Error approving staff role (insert):", roleInsertError);
          return renderErrorPage("Failed to approve staff account. Please try again.");
        }
      }

      // Mark pending approval as processed
      const { error: markError } = await supabase
        .from("pending_staff_approvals")
        .update({ is_processed: true })
        .eq("id", pendingApproval.id);

      if (markError) {
        console.error("Error marking approval as processed:", markError);
        return renderErrorPage("Approved, but failed to finalize request.");
      }

      console.log("Staff approval processed successfully for:", pendingApproval.email);

      return renderSuccessPage(
        "Staff Account Approved!",
        `${pendingApproval.full_name || pendingApproval.email} can now access the staff dashboard.`,
        "#22c55e"
      );
    }

    // Deny - remove staff role and add member role
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "staff");

    if (deleteError) {
      console.error("Error deleting staff role:", deleteError);
      return renderErrorPage("Failed to deny staff request. Please try again.");
    }

    const { error: memberError } = await supabase.from("user_roles").upsert(
      {
        user_id: userId,
        role: "member",
        is_approved: true,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role" }
    );

    if (memberError) {
      console.error("Error adding member role:", memberError);
      return renderErrorPage("Denied, but failed to set member role.");
    }

    const { error: markError } = await supabase
      .from("pending_staff_approvals")
      .update({ is_processed: true })
      .eq("id", pendingApproval.id);

    if (markError) {
      console.error("Error marking denial as processed:", markError);
      return renderErrorPage("Denied, but failed to finalize request.");
    }

    console.log("Staff request denied, user set as member:", pendingApproval.email);

    return renderSuccessPage(
      "Staff Request Denied",
      `${pendingApproval.full_name || pendingApproval.email} has been set as a regular member instead.`,
      "#f59e0b"
    );
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
        <title>${escapeHtml(title)} - NZ Sport Club</title>
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
            max-width: 420px;
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 16px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 0;
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
          <div class="icon">&#10003;</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    }
  );
}

function renderInfoPage(title: string, message: string): Response {
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(title)} - NZ Sport Club</title>
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
            max-width: 420px;
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 16px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 0;
            line-height: 1.6;
          }
          .icon {
            color: #6b7280;
            font-size: 64px;
            margin-bottom: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">&#8505;</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    }
  );
}

function renderConfirmPage(params: {
  userId: string;
  token: string;
  action: Action;
}): Response {
  const { userId, token, action } = params;
  const title = action === "approve" ? "Confirm Approval" : "Confirm Denial";
  const message =
    action === "approve"
      ? "You are about to approve this staff access request."
      : "You are about to deny this staff access request.";
  const buttonLabel = action === "approve" ? "Approve" : "Deny";
  const buttonColor = action === "approve" ? "#22c55e" : "#ef4444";

  // Confirmed processing endpoint
  const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-staff?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}&action=${encodeURIComponent(action)}&confirm=1`;

  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(title)} - NZ Sport Club</title>
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
            max-width: 480px;
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 12px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 24px;
            line-height: 1.6;
          }
          .btn {
            display: inline-block;
            padding: 14px 28px;
            border-radius: 10px;
            border: none;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
          }
          .primary {
            background: ${buttonColor};
            color: white;
          }
          .secondary {
            background: #f5f0ed;
            color: #2d2520;
            margin-left: 10px;
            text-decoration: none;
            padding: 14px 28px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}<br/>Click "${escapeHtml(buttonLabel)}" to confirm.</p>

          <form method="POST" action="${escapeHtml(actionUrl)}" style="display:inline;">
            <button class="btn primary" type="submit">${escapeHtml(buttonLabel)}</button>
          </form>

          <a class="btn secondary" href="about:blank">Cancel</a>
        </div>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
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
            max-width: 420px;
            margin: 20px;
          }
          h1 {
            color: #2d2520;
            margin-bottom: 16px;
            font-size: 24px;
          }
          p {
            color: #6b6158;
            margin-bottom: 0;
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
          <div class="icon">&#10005;</div>
          <h1>Something Went Wrong</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
    `,
    {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    }
  );
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

serve(handler);
