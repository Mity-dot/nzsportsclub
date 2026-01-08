import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StaffApprovalRequest {
  email: string;
  fullName: string;
  userId: string;
  sendPending?: boolean; // If true, send emails for all pending requests
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resend = new Resend(resendApiKey);
    const adminEmail = "slavovdimitar11@gmail.com";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { sendPending } = body;

    // If sendPending is true, send emails for all unprocessed pending requests
    if (sendPending) {
      const { data: pendingApprovals, error: fetchError } = await supabase
        .from("pending_staff_approvals")
        .select("*")
        .eq("is_processed", false);

      if (fetchError) {
        console.error("Failed to fetch pending approvals:", fetchError);
        return new Response(JSON.stringify({ error: "Failed to fetch pending approvals" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!pendingApprovals || pendingApprovals.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No pending requests" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      console.log(`Sending emails for ${pendingApprovals.length} pending requests`);

      const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];

      // Resend rate limits: keep under ~2 req/sec
      for (const approval of pendingApprovals) {
        // small spacing even on success
        await sleep(600);

        try {
          await sendApprovalEmail(resend, adminEmail, approval);
          results.push({ user_id: approval.user_id, ok: true });
        } catch (e: any) {
          console.error("Failed sending approval email:", e);
          results.push({
            user_id: approval.user_id,
            ok: false,
            error: e?.message || "Unknown error",
          });
        }
      }

      const failed = results.filter((r) => !r.ok);

      return new Response(
        JSON.stringify({
          success: failed.length === 0,
          sent: results.length - failed.length,
          failed: failed.length,
          failures: failed,
        }),
        {
          status: failed.length === 0 ? 200 : 207,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Single request mode
    const { email, fullName, userId }: StaffApprovalRequest = body;

    // Validate inputs
    if (!email || typeof email !== "string" || email.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!fullName || typeof fullName !== "string" || fullName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid name" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!userId || !UUID_REGEX.test(userId)) {
      return new Response(JSON.stringify({ error: "Invalid user ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get the approval token from the pending_staff_approvals table
    const { data: pendingApproval, error: fetchError } = await supabase
      .from("pending_staff_approvals")
      .select("*")
      .eq("user_id", userId)
      .eq("is_processed", false)
      .single();

    if (fetchError || !pendingApproval?.approval_token) {
      console.error("Failed to fetch approval token:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to process request" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    await sendApprovalEmail(resend, adminEmail, pendingApproval);

    return new Response(JSON.stringify({ success: true, message: "Approval email sent" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-staff-approval-email function:", error);
    return new Response(JSON.stringify({ error: error?.message || "An error occurred" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

async function sendApprovalEmail(resend: any, adminEmail: string, approval: any) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const approveUrl = `${baseUrl}/functions/v1/approve-staff?userId=${encodeURIComponent(approval.user_id)}&token=${encodeURIComponent(approval.approval_token)}&action=approve`;
  const denyUrl = `${baseUrl}/functions/v1/approve-staff?userId=${encodeURIComponent(approval.user_id)}&token=${encodeURIComponent(approval.approval_token)}&action=deny`;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #faf8f6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <h1 style="color: #2d2520; font-size: 24px; margin: 0 0 24px 0; text-align: center;">
              New Staff Account Request
            </h1>

            <p style="color: #6b6158; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
              A new user is requesting staff access to NZ Sport Club:
            </p>

            <div style="background: #f5f0ed; border-radius: 12px; padding: 20px; margin: 0 0 32px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6b6158; padding: 8px 0; font-size: 14px;">Name:</td>
                  <td style="color: #2d2520; padding: 8px 0; font-size: 14px; font-weight: 600;">${approval.full_name || "Not provided"}</td>
                </tr>
                <tr>
                  <td style="color: #6b6158; padding: 8px 0; font-size: 14px;">Email:</td>
                  <td style="color: #2d2520; padding: 8px 0; font-size: 14px; font-weight: 600;">${approval.email}</td>
                </tr>
                <tr>
                  <td style="color: #6b6158; padding: 8px 0; font-size: 14px;">Requested:</td>
                  <td style="color: #2d2520; padding: 8px 0; font-size: 14px; font-weight: 600;">${new Date(approval.requested_at).toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center;">
              <a href="${approveUrl}" style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 16px 8px;">
                &#10003; Approve
              </a>
              <a href="${denyUrl}" style="display: inline-block; padding: 14px 32px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 16px 8px;">
                &#10005; Deny
              </a>
            </div>

            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
              For safety, the link opens a confirmation page before applying changes.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  // simple retry for 429s
  for (let attempt = 1; attempt <= 3; attempt++) {
    const emailResponse = await resend.emails.send({
      from: "NZ Sport Club <onboarding@resend.dev>",
      to: [adminEmail],
      subject: `Staff Request: ${approval.full_name || approval.email}`,
      html: emailHtml,
    });

    if (!emailResponse?.error) {
      console.log("Approval email sent successfully:", emailResponse);
      return;
    }

    const code = emailResponse.error.statusCode;
    console.error("Resend error:", emailResponse.error);

    if (code === 429 && attempt < 3) {
      await sleep(900);
      continue;
    }

    throw new Error(emailResponse.error.message || "Failed to send email");
  }
}

serve(handler);
