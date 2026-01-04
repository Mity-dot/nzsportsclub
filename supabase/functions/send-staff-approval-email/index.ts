import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    
    const adminEmail = "slavovdimitar11@gmail.com";
    const approvalUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-staff?userId=${userId}`;
    
    console.log(`Staff approval request from ${email} (${fullName})`);
    console.log(`Admin email would be sent to: ${adminEmail}`);
    console.log(`Approval URL: ${approvalUrl}`);
    
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
        <p>To approve this request, click the button below or sign in to the admin dashboard.</p>
        <a href="${approvalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #E8C4B8; color: #333; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Approve Staff Account
        </a>
      `,
    });
    */

    return new Response(
      JSON.stringify({ success: true, message: "Notification logged" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-staff-approval-email function:", error);
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
