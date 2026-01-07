import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StaffApprovalRequest {
  email: string;
  fullName: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, userId }: StaffApprovalRequest = await req.json();
    
    // Validate inputs
    if (!email || typeof email !== 'string' || email.length > 255) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    if (!fullName || typeof fullName !== 'string' || fullName.length > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    if (!userId || !UUID_REGEX.test(userId)) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Get the approval token from the pending_staff_approvals table
    const { data: pendingApproval, error: fetchError } = await supabase
      .from("pending_staff_approvals")
      .select("approval_token")
      .eq("user_id", userId)
      .eq("is_processed", false)
      .single();
    
    if (fetchError || !pendingApproval?.approval_token) {
      console.error("Failed to fetch approval token");
      return new Response(
        JSON.stringify({ error: "Failed to process request" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Build the secure approval URL with token
    const approvalUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-staff?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(pendingApproval.approval_token)}`;
    
    // Admin email from environment variable for security
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "slavovdimitar11@gmail.com";
    
    console.log("Staff approval request processed");
    
    // For now, just log the request. In production, you'd send an email via Resend
    // To enable email sending, add RESEND_API_KEY secret and uncomment below:
    
    /*
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    await resend.emails.send({
      from: "NZ Sport Club <noreply@yourdomain.com>",
      to: [adminEmail],
      subject: "New Staff Account Request - NZ Sport Club",
      html: `
        <h1>New Staff Account Request</h1>
        <p>A new staff account request has been submitted:</p>
        <ul>
          <li><strong>Name:</strong> ${fullName}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
        <p>To approve this request, click the button below:</p>
        <a href="${approvalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #E8C4B8; color: #333; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Approve Staff Account
        </a>
        <p><small>This link can only be used once and will expire after use.</small></p>
      `,
    });
    */

    return new Response(
      JSON.stringify({ success: true, message: "Request processed" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-staff-approval-email function");
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
