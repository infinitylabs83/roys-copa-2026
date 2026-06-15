import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateGameEvents } from "../_shared/game-rules.js";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const auth=req.headers.get("Authorization") || "";
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:{user}}=await supabase.auth.getUser(auth.replace("Bearer ",""));
    if(!user) throw new Error("AUTH_REQUIRED");
    const body=await req.json();
    const {data:session,error:sessionError}=await supabase.from("game_sessions")
      .select("player_id,status").eq("id",body.sessionId).single();
    if(sessionError || !session || session.player_id!==user.id) throw new Error("SESSION_FORBIDDEN");
    const result=validateGameEvents(body.events);
    const eventHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(body.events))))).map(v=>v.toString(16).padStart(2,"0")).join("");
    const {data,error}=await supabase.rpc("finalize_game",{
      p_session_id:body.sessionId,p_score:result.score || 0,
      p_perfect_hits:result.perfects || 0,p_accuracy:result.accuracy || 0,
      p_best_combo:result.bestCombo || 1,p_event_hash:eventHash,
      p_events:body.events,p_risk_score:result.risk,
      p_validation:{rules:"minigame-2026-v1",accepted:result.accepted}
    });
    if(error) throw error;
    return Response.json(data,{headers:cors});
  } catch(error) {
    return Response.json({error:String(error.message || error)},{status:400,headers:cors});
  }
});
