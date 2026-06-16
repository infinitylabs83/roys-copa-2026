(() => {
  "use strict";

  const PASSWORD_KEY = "roys-admin-password-v1";
  const config = window.ROYS_CONFIG || {};
  const $ = selector => document.querySelector(selector);
  const state = { report: null, password: localStorage.getItem(PASSWORD_KEY) || "" };

  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString("pt-BR");
  }

  function dateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  async function adminFetch(action = "report") {
    const date = $("#dateFilter").value || today();
    const response = await fetch(`${config.SUPABASE_URL}/functions/v1/admin-dashboard`, {
      method: "POST",
      headers: {
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        "x-admin-password": state.password,
      },
      body: JSON.stringify({ action, date }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Nao foi possivel carregar o admin.");
    }
    return response;
  }

  async function load() {
    $("#refreshButton").disabled = true;
    try {
      const response = await adminFetch("report");
      state.report = await response.json();
      localStorage.setItem(PASSWORD_KEY, state.password);
      $("#loginCard").classList.add("is-hidden");
      $("#dashboard").classList.remove("is-hidden");
      render();
    } finally {
      $("#refreshButton").disabled = false;
    }
  }

  function renderSummary() {
    const s = state.report.summary;
    const metrics = [
      ["Pessoas que já jogaram", s.uniquePlayers, "jogadores únicos"],
      ["Partidas na data", s.gamesOnDate, state.report.selectedDate],
      ["Códigos usados", s.usedCodes, `${s.availableCodes} disponíveis`],
      ["Melhor pontuação", s.bestScoreOnDate, "na data selecionada"],
      ["Partidas finalizadas", s.finishedGames, `${s.totalGames} sessões totais`],
      ["Suspeitas", s.suspiciousCount, "para revisar"],
      ["Códigos cancelados", s.cancelledCodes, "lotes de teste/cancelados"],
      ["Mínimo prêmio", state.report.campaign.minimum_daily_score, "pontos"],
    ];
    $("#summaryGrid").innerHTML = metrics.map(([label, value, help]) => `
      <article class="metric"><span>${label}</span><strong>${fmt(value)}</strong><small>${help}</small></article>
    `).join("");
  }

  function renderChart() {
    const rows = state.report.dailyChart || [];
    const max = Math.max(1, ...rows.map(row => row.games));
    $("#dailyChart").innerHTML = rows.length ? rows.map(row => `
      <div class="bar" title="${row.date}: ${row.games} partidas, ${row.players} jogadores">
        <i style="height:${Math.max(8, Math.round((row.games / max) * 145))}px"></i>
        <small>${row.date.slice(5)}</small>
      </div>
    `).join("") : "<p>Nenhuma partida registrada ainda.</p>";
  }

  function renderWinner() {
    const winner = state.report.winner;
    if (!winner) {
      $("#winnerPanel").innerHTML = `
        <div class="panel-head"><h2>Vencedor Do Dia</h2><span>${state.report.selectedDate}</span></div>
        <p>Ainda não há ranking para esta data.</p>
      `;
      return;
    }
    const phone = onlyDigits(winner.phone);
    const message = encodeURIComponent(`Oi, ${winner.nickname}! Aqui é da Roy's. Você ficou em 1º no ranking da Copa Roy's em ${state.report.selectedDate} com ${winner.points} pontos. Você ganhou 1 sub grátis. Podemos combinar seu resgate?`);
    $("#winnerPanel").innerHTML = `
      <div class="panel-head"><h2>Vencedor Do Dia</h2><span>${state.report.selectedDate}</span></div>
      <p>1º lugar</p>
      <strong>${escapeHtml(winner.nickname)}</strong>
      <p>${fmt(winner.points)} pontos</p>
      <p>Telefone: ${escapeHtml(winner.phone || "-")}</p>
      ${phone ? `<a class="whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/55${phone}?text=${message}">Copiar / abrir WhatsApp</a>` : ""}
    `;
  }

  function table(headers, rows) {
    return `
      <thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">Sem registros.</td></tr>`}</tbody>
    `;
  }

  function renderLeaderboards() {
    $("#dailySubtitle").textContent = state.report.selectedDate;
    $("#dailyTable").innerHTML = table(["Pos.", "Nome", "Telefone", "Pontos", "Atualizado"], state.report.dailyLeaderboard.map(row => `
      <tr><td>${row.position}</td><td>${escapeHtml(row.nickname)}</td><td>${escapeHtml(row.phone || "-")}</td><td>${fmt(row.points)}</td><td>${dateTime(row.updated_at)}</td></tr>
    `));
    $("#generalTable").innerHTML = table(["Pos.", "Nome", "Telefone", "Pontos"], state.report.generalLeaderboard.map(row => `
      <tr><td>${row.position}</td><td>${escapeHtml(row.nickname)}</td><td>${escapeHtml(row.phone || "-")}</td><td>${fmt(row.points)}</td></tr>
    `));
  }

  function sessionRow(row) {
    const risk = row.riskScore >= 80 ? "bad" : row.riskScore > 0 ? "warn" : "";
    return `
      <tr>
        <td>${escapeHtml(row.date)}<small>${dateTime(row.startedAt)}</small></td>
        <td>${escapeHtml(row.nickname)}<small>${escapeHtml(row.phone || "-")}</small></td>
        <td><span class="pill">${escapeHtml(row.code)}</span></td>
        <td>${fmt(row.score)}<small>${row.perfectHits} perfeitos · ${row.accuracy}%</small></td>
        <td><span class="pill ${row.status === "finished" ? "" : "bad"}">${escapeHtml(row.status)}</span></td>
        <td><span class="pill ${risk}">${row.riskScore}</span><small>${escapeHtml(row.rejectionReason || "")}</small></td>
      </tr>
    `;
  }

  function renderSessions() {
    const needle = ($("#sessionSearch").value || "").toLowerCase();
    const rows = state.report.sessions
      .filter(row => !needle || `${row.nickname} ${row.phone} ${row.code}`.toLowerCase().includes(needle))
      .slice(0, 250);
    $("#sessionsTable").innerHTML = table(["Data", "Cliente", "Código", "Pontuação", "Status", "Risco"], rows.map(sessionRow));
  }

  function renderPlayers() {
    $("#loyalTable").innerHTML = table(["Cliente", "Telefone", "Dias", "Partidas", "Média/dia", "Melhor", "Última"], state.report.loyalPlayers.map(row => `
      <tr>
        <td>${escapeHtml(row.nickname)}</td><td>${escapeHtml(row.phone || "-")}</td><td>${row.daysPlayed}</td>
        <td>${row.games}</td><td>${row.avgGamesPerDay}</td><td>${fmt(row.bestScore)}</td><td>${dateTime(row.lastPlayedAt)}</td>
      </tr>
    `));
    $("#suspiciousTable").innerHTML = table(["Motivo", "Nome", "Telefone", "Data", "Detalhe"], state.report.suspicious.map(row => `
      <tr>
        <td><span class="pill warn">${escapeHtml(row.reason)}</span></td>
        <td>${escapeHtml(row.nickname || "-")}</td>
        <td>${escapeHtml(row.phone || "-")}</td>
        <td>${escapeHtml(row.date || "-")}</td>
        <td>${escapeHtml(row.count || row.code || row.names?.join(", ") || row.status || "")}</td>
      </tr>
    `));
  }

  function renderCodes() {
    const needle = ($("#codeSearch").value || "").toUpperCase().trim();
    const codes = state.report.availableCodes.filter(row => !needle || row.code.includes(needle));
    $("#availableCodes").innerHTML = codes.slice(0, 1000).map(row => `<div class="code-chip">${escapeHtml(row.code)}</div>`).join("");
    $("#usedCodesTable").innerHTML = table(["Código", "Cliente", "Telefone", "Pontuação", "Quando"], state.report.usedCodes.map(row => `
      <tr>
        <td><span class="pill">${escapeHtml(row.code)}</span></td><td>${escapeHtml(row.nickname || "-")}</td>
        <td>${escapeHtml(row.phone || "-")}</td><td>${fmt(row.score)}</td><td>${dateTime(row.consumedAt)}</td>
      </tr>
    `));
  }

  function render() {
    renderSummary();
    renderChart();
    renderWinner();
    renderLeaderboards();
    renderSessions();
    renderPlayers();
    renderCodes();
  }

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    state.password = $("#adminPassword").value.trim();
    $("#loginError").textContent = "Carregando...";
    try {
      await load();
      $("#loginError").textContent = "";
    } catch (error) {
      $("#loginError").textContent = error.message || "Senha inválida.";
    }
  });

  $("#refreshButton").addEventListener("click", () => load().catch(error => alert(error.message)));
  $("#dateFilter").addEventListener("change", () => load().catch(error => alert(error.message)));
  $("#sessionSearch").addEventListener("input", renderSessions);
  $("#codeSearch").addEventListener("input", renderCodes);
  $("#logoutButton").addEventListener("click", () => {
    localStorage.removeItem(PASSWORD_KEY);
    location.reload();
  });
  $("#csvButton").addEventListener("click", async () => {
    try {
      const response = await adminFetch("csv");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roys-copa-partidas-${$("#dateFilter").value || today()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message);
    }
  });
  $("#tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    document.querySelectorAll("[data-tab]").forEach(node => node.classList.toggle("is-active", node === button));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("is-active", panel.id === `tab-${button.dataset.tab}`));
  });

  $("#dateFilter").value = today();
  if (state.password) {
    $("#adminPassword").value = state.password;
    load().catch(() => localStorage.removeItem(PASSWORD_KEY));
  }
})();
