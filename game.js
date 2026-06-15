(() => {
  "use strict";

  const STORAGE_KEY = "roys-acrescimos-mvp-v3";
  const TOTAL_ROUNDS = 18;
  const MINIMUM_SCORE = 7000;
  const MAX_SCORE = 11070;
  const VALID_CODES = window.ROYS_CONFIG?.LOCAL_DEMO_CODES || [];
  const ingredients = [
    ["ALFACE", "alface", 0], ["TOMATE", "tomate", 1], ["QUEIJO", "queijo", 2],
    ["STEAK", "steak", 3], ["MOLHO ROY'S", "molho", 4], ["PÃO", "pao", 5]
  ];
  const baseDaily = [["Nina 10", 8460], ["Leo do Molho", 7910], ["Bia do Sub", 6870], ["Caio Steak", 6350]];
  const baseGeneral = [["Nina 10", 38450], ["Bia do Sub", 36980], ["Leo do Molho", 34700], ["Caio Steak", 31860]];

  const $ = selector => document.querySelector(selector);
  const screens = [...document.querySelectorAll(".screen")];
  const el = {
    score: $("#scoreValue"), round: $("#roundValue"), combo: $("#comboValue"),
    level: $("#levelName"), mode: $("#modeName"), field: $("#playfield"),
    zone: $("#hitZone"), ingredient: $("#movingIngredient"), ingredientName: $("#ingredientName"),
    feedback: $("#feedback"), double: $("#doubleBanner"), ole: $("#oleBanner"), countdown: $("#countdownValue"),
    finalScore: $("#finalScore"), perfects: $("#perfectCount"), bestCombo: $("#bestCombo"),
    accuracy: $("#accuracyValue"), resultMode: $("#resultMode"), resultTitle: $("#resultTitle"),
    resultSummary: $("#resultSummary"), eligibility: $("#eligibilityCard"),
    eligibilityTitle: $("#eligibilityTitle"), eligibilityCopy: $("#eligibilityCopy"),
    rankingList: $("#rankingList"), accessError: $("#accessError")
  };

  let store = loadStore();
  let state = {};
  let frameId = 0;

  function loadStore() {
    try {
      return { usedCodes: {}, scores: [], player: null, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
      return { usedCodes: {}, scores: [], player: null };
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  }

  function show(id) {
    screens.forEach(screen => screen.classList.toggle("is-active", screen.id === id));
    window.scrollTo(0, 0);
  }

  function reset(mode) {
    state = {
      mode, score: 0, round: 0, streak: 0, combo: 1, bestCombo: 1,
      perfects: 0, quality: 0, resolving: false, playing: false,
      roundStart: 0, roundDuration: 2100, currentWave: 0, dribbleCalled: false,
      events: [], sessionId: null, player: mode === "official" ? store.player : null
    };
    document.querySelectorAll("[data-layer]").forEach(node => node.classList.remove("is-built"));
    el.double.classList.remove("show");
    el.ole.classList.remove("show");
    updateHud();
  }

  function start(mode) {
    reset(mode);
    state.gameStartedAt = performance.now();
    show("countdownScreen");
    let count = 3;
    el.countdown.textContent = count;
    const timer = setInterval(() => {
      count -= 1;
      if (count < 0) {
        clearInterval(timer);
        beginRound();
        return;
      }
      el.countdown.textContent = count || "JÁ!";
    }, 550);
  }

  function beginRound() {
    show("gameScreen");
    state.playing = true;
    state.round += 1;
    state.resolving = false;
    const difficulty = Math.floor((state.round - 1) / 6);
    if (state.round <= 6) {
      state.roundDuration = 2200 - ((state.round - 1) * 70);
    } else if (state.round <= 12) {
      state.roundDuration = 1750 - ((state.round - 7) * 60);
    } else {
      state.roundDuration = 1350 - ((state.round - 13) * 50);
    }
    state.roundStart = performance.now();
    state.dribbleCalled = false;
    const item = ingredients[(state.round - 1) % ingredients.length];
    el.ingredient.dataset.kind = item[1];
    el.ingredientName.textContent = item[0];
    el.ingredient.style.opacity = "1";
    el.level.textContent = ["RITMO FORTE", "SEGUNDO TEMPO", "PRESSÃO TOTAL"][difficulty];
    el.mode.textContent = state.mode === "official" ? "OFICIAL" : "TREINO";
    el.double.classList.toggle("show", state.round >= 16);
    el.ole.classList.remove("show");
    updateHud();
    frameId = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!state.playing) return;
    const progress = (now - state.roundStart) / state.roundDuration;
    const width = el.field.clientWidth;
    const x = -95 + progress * (width + 190);
    const isDribbling = state.round >= 10;
    const wave = isDribbling
      ? Math.sin(progress * Math.PI * 5 + state.round * .7) * 68
      : Math.sin(progress * Math.PI * 2) * 10;
    state.currentWave = wave;
    el.ingredient.style.transform = `translate3d(${x}px,${wave}px,0) rotate(${wave * .1}deg)`;
    if (isDribbling && progress >= .3 && !state.dribbleCalled) {
      state.dribbleCalled = true;
      showDribbleCall();
    }
    if (progress >= 1 && !state.resolving) resolve(0, "PASSOU!", 0);
    frameId = requestAnimationFrame(loop);
  }

  function tap() {
    if (!state.playing || state.resolving) return;
    el.ole.classList.remove("show");
    const ingredientRect = el.ingredient.getBoundingClientRect();
    const zoneRect = el.zone.getBoundingClientRect();
    const ingredientCenter = ingredientRect.left + ingredientRect.width / 2;
    const zoneCenter = zoneRect.left + zoneRect.width / 2;
    const distance = Math.abs(ingredientCenter - zoneCenter);
    const halfZone = zoneRect.width / 2;
    const verticalDistance = state.round >= 10 ? Math.abs(state.currentWave) : 0;
    const normalizedHorizontal = halfZone ? distance / halfZone : 99;
    state.pendingHitMetrics = {
      normalizedHorizontal: Number(normalizedHorizontal.toFixed(4)),
      verticalDistance: Number(verticalDistance.toFixed(2)),
      roundElapsedMs: Math.max(0, Math.round(performance.now() - state.roundStart))
    };

    if (distance <= halfZone * .22 && verticalDistance <= 16) resolve(300, "PERFEITO!", 1);
    else if (distance <= halfZone * .55 && verticalDistance <= 42) resolve(200, "ÓTIMO!", .72);
    else if (distance <= halfZone && verticalDistance <= 66) resolve(100, "BOM!", .42);
    else resolve(0, state.round >= 10 ? "O DRIBLE LEVOU!" : "FORA!", 0);
    $("#tapButton").classList.add("is-hit");
    setTimeout(() => $("#tapButton").classList.remove("is-hit"), 120);
  }

  function multiplier() {
    if (state.streak >= 8) return 2;
    if (state.streak >= 5) return 1.5;
    if (state.streak >= 3) return 1.2;
    return 1;
  }

  function resolve(base, label, quality) {
    if (state.resolving) return;
    state.resolving = true;
    state.streak = base ? state.streak + 1 : 0;
    state.combo = multiplier();
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.quality += quality;
    if (base === 300) state.perfects += 1;
    const overtime = state.round >= 16 ? 2 : 1;
    const gained = Math.round(base * state.combo * overtime);
    state.score += gained;
    state.events.push({
      round: state.round,
      elapsedMs: Math.round(performance.now() - state.gameStartedAt),
      roundDuration: state.roundDuration,
      base,
      quality,
      combo: state.combo,
      overtime,
      normalizedHorizontal: state.pendingHitMetrics?.normalizedHorizontal ?? 99,
      verticalDistance: state.pendingHitMetrics?.verticalDistance ?? 99,
      roundElapsedMs: state.pendingHitMetrics?.roundElapsedMs ?? state.roundDuration
    });
    state.pendingHitMetrics = null;
    if (base) buildLayer();
    feedback(label, gained, overtime);
    updateHud();
    el.ingredient.style.opacity = ".18";

    setTimeout(() => {
      cancelAnimationFrame(frameId);
      if (state.round >= TOTAL_ROUNDS) finish();
      else beginRound();
    }, 430);
  }

  function buildLayer() {
    const layerIndex = ingredients[(state.round - 1) % ingredients.length][2];
    document.querySelector(`[data-layer="${layerIndex}"]`)?.classList.add("is-built");
  }

  function feedback(label, gained, overtime) {
    el.feedback.classList.remove("show");
    void el.feedback.offsetWidth;
    el.feedback.innerHTML = `${label}<small>${gained ? `+${gained}${overtime === 2 ? " · 2×" : ""}` : "0 PONTOS"}</small>`;
    el.feedback.classList.add("show");
  }

  function showDribbleCall() {
    const calls = [
      ["OLÉÉÉ!", "O INGREDIENTE DEU UM CORTE"],
      ["QUE ISSO!", "MANDOU O GARFO PRO OUTRO LADO"],
      ["CANETA!", "AGORA SEGURA ESSE RECHEIO"]
    ];
    const call = calls[(state.round - 10) % calls.length];
    el.ole.innerHTML = `${call[0]}<small>${call[1]}</small>`;
    el.ole.classList.remove("show");
    void el.ole.offsetWidth;
    el.ole.classList.add("show");
  }

  function updateHud() {
    el.score.textContent = String(state.score || 0).padStart(4, "0");
    el.round.textContent = state.round || 1;
    el.combo.textContent = `${state.combo || 1}×`;
  }

  async function finish() {
    state.playing = false;
    cancelAnimationFrame(frameId);
    const accuracy = Math.round((state.quality / TOTAL_ROUNDS) * 100);
    el.finalScore.textContent = state.score.toLocaleString("pt-BR");
    el.perfects.textContent = state.perfects;
    el.bestCombo.textContent = `${state.bestCombo}×`;
    el.accuracy.textContent = `${accuracy}%`;
    el.resultMode.textContent = state.mode === "official" ? "PARTIDA OFICIAL REGISTRADA" : "TREINO CONCLUÍDO";
    el.resultTitle.textContent = state.score >= MINIMUM_SCORE ? "ENTROU NA BRIGA." : "APITO FINAL.";
    el.resultSummary.textContent = `Você fez ${state.score.toLocaleString("pt-BR")} de ${MAX_SCORE.toLocaleString("pt-BR")} pontos possíveis.`;
    el.eligibility.classList.toggle("is-qualified", state.score >= MINIMUM_SCORE && state.mode === "official");

    if (state.mode === "official") {
      try {
        const serverResult = await window.RoysBackend.finishGame({
          sessionId: state.sessionId,
          events: state.events
        });
        if (serverResult.accepted === false) {
          el.eligibilityTitle.textContent = "PARTIDA EM ANÁLISE";
          el.eligibilityCopy.textContent = "O servidor identificou uma inconsistência e o resultado não entrou no ranking.";
          show("resultScreen");
          return;
        }
      } catch {
        el.eligibilityTitle.textContent = "RESULTADO PENDENTE";
        el.eligibilityCopy.textContent = "Não foi possível confirmar a partida agora. Não feche esta página e procure a equipe.";
        show("resultScreen");
        return;
      }
      store.scores.push({ name: state.player.name, phone: state.player.phone, score: state.score, date: today(), createdAt: Date.now() });
      saveStore();
      if (state.score >= MINIMUM_SCORE) {
        el.eligibilityTitle.textContent = "VOCÊ ESTÁ ELEGÍVEL AO PRÊMIO DIÁRIO";
        el.eligibilityCopy.textContent = "Sua melhor pontuação de hoje entrou no ranking. O vencedor é apurado após o fechamento da loja.";
      } else {
        el.eligibilityTitle.textContent = `FALTARAM ${(MINIMUM_SCORE - state.score).toLocaleString("pt-BR")} PONTOS`;
        el.eligibilityCopy.textContent = "O resultado foi registrado, mas o prêmio diário exige no mínimo 7.000 pontos.";
      }
    } else {
      el.eligibilityTitle.textContent = "TREINO NÃO ENTRA NO RANKING";
      el.eligibilityCopy.textContent = "Para competir, faça uma compra e ative o código impresso entregue pelo atendente.";
    }
    show("resultScreen");
  }

  async function validateAccess(event) {
    event.preventDefault();
    const name = $("#playerName").value.trim();
    const phone = $("#playerPhone").value.replace(/\D/g, "");
    const code = $("#purchaseCode").value.trim().toUpperCase();
    if (name.length < 2 || phone.length < 10) {
      el.accessError.textContent = "Preencha nome e WhatsApp válidos.";
      return;
    }
    if (!window.RoysBackend.enabled && !window.RoysBackend.localDemoEnabled) {
      el.accessError.textContent = "Partida oficial temporariamente indisponível. Avise a equipe Roy's.";
      return;
    }
    if (window.RoysBackend.localDemoEnabled && !VALID_CODES.includes(code)) {
      el.accessError.textContent = "Código inexistente ou fora do lote ativo.";
      return;
    }
    if (window.RoysBackend.localDemoEnabled && store.usedCodes[code]) {
      el.accessError.textContent = "Este código já foi utilizado.";
      return;
    }
    el.accessError.textContent = "Validando código...";
    try {
      const session = await window.RoysBackend.startGame({ code, nickname: name, phone });
      if (window.RoysBackend.localDemoEnabled) store.usedCodes[code] = { usedAt: Date.now(), phone };
      store.player = { name, phone };
      saveStore();
      el.accessError.textContent = "";
      start("official");
      state.sessionId = session.sessionId || session.session_id;
      state.gameStartedAt = performance.now();
    } catch (error) {
      el.accessError.textContent = error.message || "Não foi possível validar o código.";
    }
  }

  function bestByPlayer(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = row.phone || row.name;
      if (!map.has(key) || row.score > map.get(key).score) map.set(key, row);
    });
    return [...map.values()];
  }

  async function renderRanking(type = "daily") {
    document.querySelectorAll("[data-ranking]").forEach(button => button.classList.toggle("is-active", button.dataset.ranking === type));
    let rows;
    if (window.RoysBackend.enabled) {
      el.rankingList.innerHTML = "<li><span><strong>CARREGANDO PLACAR...</strong></span></li>";
      try {
        const remote = await window.RoysBackend.getLeaderboard(type, today());
        rows = remote.map(row => ({
          name: row.nickname,
          score: row.points,
          position: row.position
        }));
      } catch (error) {
        el.rankingList.innerHTML = `<li><span><strong>${escapeHtml(error.message || "Ranking indisponível.")}</strong></span></li>`;
        return;
      }
    } else if (type === "daily") {
      rows = [...baseDaily.map(([name, score]) => ({ name, score })), ...bestByPlayer(store.scores.filter(row => row.date === today()))];
    } else {
      const perDay = new Map();
      store.scores.forEach(row => {
        const key = `${row.phone}-${row.date}`;
        if (!perDay.has(key) || row.score > perDay.get(key).score) perDay.set(key, row);
      });
      const totals = new Map();
      [...perDay.values()].forEach(row => totals.set(row.phone, { name: row.name, score: (totals.get(row.phone)?.score || 0) + row.score }));
      rows = [...baseGeneral.map(([name, score]) => ({ name, score })), ...totals.values()];
    }
    rows.sort((a, b) => b.score - a.score);
    if (!rows.length) {
      el.rankingList.innerHTML = "<li><span><strong>AINDA NÃO HÁ PONTUAÇÕES NESTE PLACAR.</strong></span></li>";
      return;
    }
    el.rankingList.innerHTML = rows.slice(0, 10).map((row, index) => `
      <li class="${row.phone === store.player?.phone ? "is-me" : ""}">
        <b>${row.position || index + 1}</b><span><strong>${escapeHtml(row.name)}</strong><small>${index === 0 ? "LÍDER" : "PARTICIPANTE"}</small></span>
        <em>${row.score.toLocaleString("pt-BR")} pts</em>
      </li>`).join("");
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  $("#officialButton").addEventListener("click", () => show("accessScreen"));
  $("#trainingButton").addEventListener("click", () => start("training"));
  $("#backHomeButton").addEventListener("click", () => show("introScreen"));
  $("#accessForm").addEventListener("submit", validateAccess);
  $("#tapButton").addEventListener("click", tap);
  el.field.addEventListener("pointerdown", tap);
  $("#playAgainButton").addEventListener("click", () => show("introScreen"));
  [$("#rankingButton"), $("#showRankingButton")].forEach(button => button.addEventListener("click", () => { renderRanking(); show("rankingScreen"); }));
  $("#rankingHomeButton").addEventListener("click", () => show("introScreen"));
  document.querySelectorAll("[data-ranking]").forEach(button => button.addEventListener("click", () => renderRanking(button.dataset.ranking)));
  document.addEventListener("keydown", event => {
    if (event.code === "Space" && $("#gameScreen").classList.contains("is-active")) {
      event.preventDefault();
      tap();
    }
  });
})();
