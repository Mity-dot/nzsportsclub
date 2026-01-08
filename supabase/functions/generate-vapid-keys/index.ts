import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Generate ECDSA P-256 key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    // Export private key as JWK (for VAPID_PRIVATE_KEY)
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    // Export public key as raw (uncompressed point) for VAPID_PUBLIC_KEY
    const publicRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const publicKeyBase64Url = uint8ArrayToBase64Url(new Uint8Array(publicRaw));

    // The private key as JWK string (store this as VAPID_PRIVATE_KEY)
    const privateKeyJwk = JSON.stringify({
      kty: privateJwk.kty,
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
      d: privateJwk.d,
    });

    return new Response(
      JSON.stringify({
        VAPID_PUBLIC_KEY: publicKeyBase64Url,
        VAPID_PRIVATE_KEY: privateKeyJwk,
        instructions: "Copy these values to update your secrets",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error generating VAPID keys:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
