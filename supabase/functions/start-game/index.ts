import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const encode = (value:string) => new TextEncoder().encode(value);
const hex = (buffer:ArrayBuffer) =>
  [...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,"0")).join("");
async function hmac(value:string,secret:string) {
  const key=await crypto.subtle.importKey("raw",encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,encode(value.trim().toUpperCase())));
}
async function encrypt(value:string,secret:string) {
  const keyBytes=await crypto.subtle.digest("SHA-256",encode(secret));
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encode(value));
  const joined=new Uint8Array(iv.length+cipher.byteLength);
  joined.set(iv);
  joined.set(new Uint8Array(cipher),iv.length);
  return btoa(String.fromCharCode(...joined));
}

Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const auth=req.headers.get("Authorization") || "";
    const supabase=createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const {data:{user}}=await supabase.auth.getUser(auth.replace("Bearer ",""));
    if(!user) throw new Error("AUTH_REQUIRED");
    const body=await req.json();
    const phone=String(body.phone || "").replace(/\D/g,"");
    const code=String(body.code || "").trim().toUpperCase();
    const campaign=String(body.campaign || "").trim();
    if(phone.length<10 || String(body.nickname || "").trim().length<2) throw new Error("PROFILE_INVALID");
    if(!/^[A-HJ-NP-Z]{3}[0-9]{3}$/.test(code)) throw new Error("CODE_INVALID_FORMAT");
    if(!campaign) throw new Error("CAMPAIGN_REQUIRED");
    const phoneHash=await hmac(phone,Deno.env.get("PHONE_PEPPER")!);
    const phoneCiphertext=await encrypt(phone,Deno.env.get("PII_KEY")!);
    const {error:profileError}=await supabase.from("player_profiles").upsert({
      user_id:user.id,
      nickname:String(body.nickname).trim().slice(0,24),
      phone_hash:phoneHash,
      phone_last4:phone.slice(-4),
      terms_version:String(body.termsVersion || "draft-2026-06"),
      terms_accepted_at:new Date().toISOString(),
      marketing_consent:Boolean(body.marketingConsent)
    });
    if(profileError) throw profileError;
    const retention=new Date();
    retention.setDate(retention.getDate()+120);
    const {error:privateError}=await supabase.from("player_private").upsert({
      user_id:user.id,
      phone_ciphertext:phoneCiphertext,
      retention_until:retention.toISOString().slice(0,10)
    });
    if(privateError) throw privateError;
    const codeDigest=await hmac(code,Deno.env.get("CODE_PEPPER")!);
    const seed=crypto.randomUUID();
    const deviceHash=await hmac(body.deviceId || "unknown",Deno.env.get("DEVICE_PEPPER")!);
    const ipHash=await hmac(req.headers.get("x-forwarded-for") || "unknown",Deno.env.get("IP_PEPPER")!);
    const {error:rateError}=await supabase.rpc("register_code_attempt",{
      p_user_id:user.id,p_device_hash:deviceHash,p_ip_hash:ipHash
    });
    if(rateError) throw rateError;
    const {data,error}=await supabase.rpc("consume_game_code",{
      p_user_id:user.id,p_code_digest:codeDigest,p_device_hash:deviceHash,
      p_ip_hash:ipHash,p_seed:seed,p_campaign_slug:campaign
    });
    if(error) throw error;
    return Response.json(data[0],{headers:cors});
  } catch(error) {
    return Response.json({error:String(error.message || error)},{status:400,headers:cors});
  }
});
