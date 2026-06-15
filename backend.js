(() => {
  "use strict";
  const AUTH_KEY = "roys-supabase-auth-v1";
  const DEVICE_KEY = "roys-device-id-v1";
  const config = window.ROYS_CONFIG || {};
  const enabled = Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY);
  const localDemoEnabled = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  async function getAuth() {
    const cached = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (cached?.access_token && cached.expires_at * 1000 > Date.now() + 60000) return cached;
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) throw new Error("Não foi possível criar a sessão segura.");
    const auth = await response.json();
    auth.expires_at = Math.floor(Date.now() / 1000) + Number(auth.expires_in || 3600);
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    return auth;
  }

  async function invoke(name, payload) {
    const auth = await getAuth();
    const response = await fetch(`${config.SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha no servidor.");
    return data;
  }

  async function rest(path) {
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) throw new Error("Não foi possível carregar o ranking.");
    return response.json();
  }

  window.RoysBackend = {
    enabled,
    localDemoEnabled,
    async startGame({ code, nickname, phone }) {
      if (!enabled) {
        if (!localDemoEnabled) {
          throw new Error("Partida oficial temporariamente indisponível. Avise a equipe Roy's.");
        }
        return { local: true, sessionId: crypto.randomUUID() };
      }
      return invoke(config.START_GAME_FUNCTION, {
        code, nickname, phone, campaign: config.CAMPAIGN_SLUG, deviceId: deviceId()
      });
    },
    async finishGame({ sessionId, events }) {
      if (!enabled) {
        if (!localDemoEnabled) return { local: false, accepted: false };
        return { local: true, accepted: true };
      }
      return invoke(config.FINISH_GAME_FUNCTION, { sessionId, events });
    },
    async getLeaderboard(type, day) {
      if (!enabled) return null;
      const campaigns = await rest(
        `campaigns?slug=eq.${encodeURIComponent(config.CAMPAIGN_SLUG)}&select=id&limit=1`
      );
      if (!campaigns[0]?.id) throw new Error("Campanha não encontrada.");
      const periodKey = type === "daily" ? day : "all";
      return rest(
        `public_leaderboard?campaign_id=eq.${campaigns[0].id}` +
        `&period_type=eq.${type}&period_key=eq.${periodKey}` +
        "&select=nickname,points,position&order=position.asc&limit=10"
      );
    }
  };
})();
