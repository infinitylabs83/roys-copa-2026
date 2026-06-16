import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: ArrayBuffer) => new TextDecoder().decode(value);

async function decrypt(ciphertext: string, secret: string) {
  const joined = Uint8Array.from(atob(ciphertext), char => char.charCodeAt(0));
  const iv = joined.slice(0, 12);
  const cipher = joined.slice(12);
  const keyBytes = await crypto.subtle.digest("SHA-256", encode(secret));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  return decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher));
}

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function toSpDate(value: string) {
  return dayKey(new Date(value));
}

function minutesBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

function csvSafe(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n;]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const provided = (req.headers.get("x-admin-password") || "").trim();
    if (!adminPassword || provided !== adminPassword.trim()) {
      return Response.json({ error: "ADMIN_UNAUTHORIZED" }, { status: 401, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    const selectedDate = String(body.date || dayKey());
    const action = String(body.action || "report");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id,slug,name,minimum_daily_score,maximum_score")
      .eq("slug", "copa-roys-2026")
      .single();
    if (campaignError) throw campaignError;

    const [{ data: profiles }, { data: privates }, { data: sessions }, { data: codes }, { data: leaderboard }, { data: dailyScores }] =
      await Promise.all([
        supabase.from("player_profiles").select("user_id,nickname,phone_hash,phone_last4,created_at"),
        supabase.from("player_private").select("user_id,phone_ciphertext"),
        supabase.from("game_sessions").select("id,campaign_id,player_id,code_id,store_id,status,started_at,finished_at,score,perfect_hits,accuracy,best_combo,risk_score,rejection_reason,device_hash,ip_hash").eq("campaign_id", campaign.id).order("started_at", { ascending: false }).limit(5000),
        supabase.from("access_codes").select("id,batch_id,code_label,status,consumed_by,consumed_at,created_at").order("created_at", { ascending: false }).limit(5000),
        supabase.from("public_leaderboard").select("period_type,period_key,player_id,nickname,points,position,updated_at").eq("campaign_id", campaign.id).order("position", { ascending: true }),
        supabase.from("daily_scores").select("score_date,player_id,best_session_id,best_score,perfect_hits,best_combo,accuracy,achieved_at").eq("campaign_id", campaign.id).order("score_date", { ascending: false }),
      ]);

    const privateByUser = new Map((privates || []).map(row => [row.user_id, row.phone_ciphertext]));
    const profileByUser = new Map();
    for (const profile of profiles || []) {
      const phoneCiphertext = privateByUser.get(profile.user_id);
      let phone = "";
      if (phoneCiphertext) {
        try {
          phone = await decrypt(phoneCiphertext, Deno.env.get("PII_KEY")!);
        } catch {
          phone = `****${profile.phone_last4}`;
        }
      }
      profileByUser.set(profile.user_id, { ...profile, phone });
    }

    const codeById = new Map((codes || []).map(code => [code.id, code]));
    const enrichedSessions = (sessions || []).map(session => {
      const profile = profileByUser.get(session.player_id) || {};
      const code = codeById.get(session.code_id) || {};
      const playedDate = toSpDate(session.finished_at || session.started_at);
      return {
        id: session.id,
        date: playedDate,
        startedAt: session.started_at,
        finishedAt: session.finished_at,
        nickname: profile.nickname || "Sem nome",
        phone: profile.phone || "",
        phoneLast4: profile.phone_last4 || "",
        phoneHash: profile.phone_hash || "",
        code: code.code_label || "sem-label",
        codeStatus: code.status || "",
        status: session.status,
        score: session.score || 0,
        perfectHits: session.perfect_hits || 0,
        accuracy: Number(session.accuracy || 0),
        bestCombo: Number(session.best_combo || 1),
        riskScore: session.risk_score || 0,
        rejectionReason: session.rejection_reason || "",
        deviceHash: session.device_hash || "",
        ipHash: session.ip_hash || "",
      };
    });

    const finished = enrichedSessions.filter(row => row.status === "finished");
    const todaySessions = enrichedSessions.filter(row => row.date === selectedDate);
    const uniquePlayers = new Set(enrichedSessions.map(row => row.phoneHash || row.phone).filter(Boolean));
    const uniqueToday = new Set(todaySessions.map(row => row.phoneHash || row.phone).filter(Boolean));
    const availableCodes = (codes || []).filter(code => code.status === "available").map(code => ({
      id: code.id,
      code: code.code_label || "sem-label",
      createdAt: code.created_at,
    })).sort((a, b) => a.code.localeCompare(b.code));
    const usedCodes = (codes || []).filter(code => code.status === "consumed").map(code => {
      const session = enrichedSessions.find(row => row.code === code.code_label);
      const profile = profileByUser.get(code.consumed_by || "");
      return {
        code: code.code_label || "sem-label",
        consumedAt: code.consumed_at,
        nickname: profile?.nickname || session?.nickname || "",
        phone: profile?.phone || session?.phone || "",
        score: session?.score || 0,
        status: session?.status || "",
      };
    });

    const byPlayer = new Map<string, any>();
    for (const row of enrichedSessions) {
      const key = row.phoneHash || row.phone || row.nickname;
      const item = byPlayer.get(key) || {
        nickname: row.nickname,
        phone: row.phone,
        phoneLast4: row.phoneLast4,
        phoneHash: row.phoneHash,
        games: 0,
        finishedGames: 0,
        days: new Set<string>(),
        scores: [],
        codes: new Set<string>(),
        lastPlayedAt: row.startedAt,
        names: new Set<string>(),
      };
      item.games += 1;
      if (row.status === "finished") item.finishedGames += 1;
      item.days.add(row.date);
      item.scores.push(row.score || 0);
      item.codes.add(row.code);
      item.names.add(row.nickname);
      if (new Date(row.startedAt) > new Date(item.lastPlayedAt)) item.lastPlayedAt = row.startedAt;
      byPlayer.set(key, item);
    }

    const players = [...byPlayer.values()].map(item => {
      const daysPlayed = item.days.size;
      const games = item.games;
      const scores = item.scores.filter((score: number) => score > 0);
      return {
        nickname: item.nickname,
        phone: item.phone,
        phoneLast4: item.phoneLast4,
        games,
        finishedGames: item.finishedGames,
        daysPlayed,
        avgGamesPerDay: daysPlayed ? Number((games / daysPlayed).toFixed(2)) : games,
        bestScore: Math.max(0, ...scores),
        avgScore: scores.length ? Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length) : 0,
        codesUsed: item.codes.size,
        names: [...item.names],
        lastPlayedAt: item.lastPlayedAt,
      };
    }).sort((a, b) => b.daysPlayed - a.daysPlayed || b.games - a.games);

    const loyalPlayers = players
      .filter(player => player.daysPlayed >= 2 && player.avgGamesPerDay <= 2.5)
      .slice(0, 20);

    const suspicious: any[] = [];
    for (const player of players) {
      const rows = enrichedSessions
        .filter(row => row.phone === player.phone || row.phoneLast4 && row.phoneLast4 === player.phoneLast4 && row.nickname === player.nickname)
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      const byDate = new Map<string, any[]>();
      for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) || []), row]);
      for (const [date, dayRows] of byDate) {
        if (dayRows.length >= 5) suspicious.push({ reason: "5+ partidas no mesmo dia", date, nickname: player.nickname, phone: player.phone, count: dayRows.length });
        for (let i = 0; i + 2 < dayRows.length; i += 1) {
          if (minutesBetween(dayRows[i].startedAt, dayRows[i + 2].startedAt) <= 30) {
            suspicious.push({ reason: "3+ partidas em menos de 30 minutos", date, nickname: player.nickname, phone: player.phone, count: 3 });
            break;
          }
        }
      }
      if (player.names.length >= 3) suspicious.push({ reason: "Mesmo telefone com 3+ nomes", nickname: player.nickname, phone: player.phone, names: player.names });
    }

    const deviceMap = new Map<string, Set<string>>();
    for (const row of enrichedSessions) {
      if (!row.deviceHash || !row.phoneHash) continue;
      const set = deviceMap.get(row.deviceHash) || new Set<string>();
      set.add(row.phoneHash);
      deviceMap.set(row.deviceHash, set);
    }
    for (const [deviceHash, phones] of deviceMap) {
      if (phones.size >= 3) suspicious.push({ reason: "Mesmo aparelho com 3+ telefones", deviceHash, phones: phones.size });
    }
    for (const row of usedCodes) {
      if (row.status && row.status !== "finished") suspicious.push({ reason: "Código consumido sem partida finalizada", code: row.code, nickname: row.nickname, phone: row.phone, status: row.status });
    }

    const byDay = new Map<string, any>();
    for (const row of enrichedSessions) {
      const item = byDay.get(row.date) || { date: row.date, games: 0, players: new Set<string>(), bestScore: 0 };
      item.games += 1;
      if (row.phoneHash || row.phone) item.players.add(row.phoneHash || row.phone);
      item.bestScore = Math.max(item.bestScore, row.score || 0);
      byDay.set(row.date, item);
    }
    const dailyChart = [...byDay.values()]
      .map(row => ({ date: row.date, games: row.games, players: row.players.size, bestScore: row.bestScore }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dailyLeaderboard = (leaderboard || []).filter(row => row.period_type === "daily" && row.period_key === selectedDate);
    const generalLeaderboard = (leaderboard || []).filter(row => row.period_type === "general" && row.period_key === "all");
    const winner = dailyLeaderboard[0];
    const winnerProfile = winner ? profileByUser.get(winner.player_id) : null;

    const report = {
      campaign,
      selectedDate,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCodes: (codes || []).length,
        availableCodes: availableCodes.length,
        usedCodes: usedCodes.length,
        cancelledCodes: (codes || []).filter(code => code.status === "cancelled").length,
        totalGames: enrichedSessions.length,
        finishedGames: finished.length,
        gamesOnDate: todaySessions.length,
        uniquePlayers: uniquePlayers.size,
        uniquePlayersOnDate: uniqueToday.size,
        suspiciousCount: suspicious.length,
        bestScoreOnDate: Math.max(0, ...todaySessions.map(row => row.score || 0)),
      },
      dailyLeaderboard: dailyLeaderboard.map(row => ({ ...row, phone: profileByUser.get(row.player_id)?.phone || "" })),
      generalLeaderboard: generalLeaderboard.map(row => ({ ...row, phone: profileByUser.get(row.player_id)?.phone || "" })),
      sessions: enrichedSessions,
      usedCodes,
      availableCodes,
      players,
      loyalPlayers,
      suspicious,
      dailyChart,
      winner: winner ? { ...winner, phone: winnerProfile?.phone || "" } : null,
      dailyScores,
    };

    if (action === "csv") {
      const rows = enrichedSessions.map(row => [
        row.date, row.startedAt, row.nickname, row.phone, row.code, row.status, row.score,
        row.perfectHits, row.accuracy, row.bestCombo, row.riskScore,
      ]);
      const csv = [
        ["data", "hora_inicio", "nome", "telefone", "codigo", "status", "pontuacao", "perfeitos", "precisao", "combo", "risco"],
        ...rows,
      ].map(row => row.map(csvSafe).join(",")).join("\n");
      return new Response(csv, {
        headers: { ...cors, "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    return Response.json(report, { headers: cors });
  } catch (error) {
    return Response.json({ error: String(error.message || error) }, { status: 400, headers: cors });
  }
});
