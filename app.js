/* ==========================================================================
   Caloria Certa — lógica da calculadora
   Fórmulas: Mifflin-St Jeor (TMB) + fatores de atividade (TDEE)
   ========================================================================== */

(() => {
  "use strict";

  const STORAGE = {
    history: "caloriaCerta.history.v1",
    waitlist: "caloriaCerta.waitlist.v1",
  };

  const FREE_HISTORY_LIMIT = 5;

  const ACTIVITY_LABELS = {
    "1.2": "Sedentário",
    "1.375": "Levemente ativo",
    "1.55": "Moderadamente ativo",
    "1.725": "Muito ativo",
    "1.9": "Atleta",
  };

  const GOAL_LABELS = {
    emagrecer: "Emagrecimento",
    manter: "Manutenção",
    ganhar: "Ganho de massa",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* ------------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------------ */

  function parseNumber(value) {
    if (typeof value === "number") return value;
    const clean = String(value).trim().replace(/\s/g, "").replace(",", ".");
    if (!clean) return NaN;
    return Number(clean);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function animateNumber(el, target, suffix = "") {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.textContent = nfInt.format(target) + suffix;
      return;
    }
    const start = performance.now();
    const from = Number(el.dataset.value || 0);
    const duration = 550;
    const tick = (now) => {
      const p = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(from + (target - from) * eased);
      el.textContent = nfInt.format(value) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.dataset.value = String(target);
    };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------------
     Cálculo
     ------------------------------------------------------------------------ */

  function calculate(data) {
    const { sexo, peso, altura, idade, fator, objetivo, proteina, gordura } = data;

    // 1) TMB — Mifflin-St Jeor
    let tmb = 10 * peso + 6.25 * altura - 5 * idade;
    if (sexo === "masc") tmb += 5;
    else if (sexo === "fem") tmb -= 161;
    else tmb -= 80; // média neutra entre os dois ajustes

    // 2) TDEE
    const tdee = tmb * fator;

    // 3) Meta calórica
    let alvo = tdee;
    if (objetivo === "emagrecer") alvo = tdee - 500;
    if (objetivo === "ganhar") alvo = tdee + 300;

    // 4) Macros
    const gProt = peso * proteina;
    const gGord = peso * gordura;
    const calProtGord = gProt * 4 + gGord * 9;
    const excede = calProtGord >= alvo;
    const gCarb = excede ? 0 : (alvo - calProtGord) / 4;

    const calProt = gProt * 4;
    const calGord = gGord * 9;
    const calCarb = gCarb * 4;
    const calTotal = calProt + calGord + calCarb || 1;

    // 5) IMC e água
    const alturaM = altura / 100;
    const imc = peso / (alturaM * alturaM);
    const agua = peso * 35; // ml

    return {
      tmb,
      tdee,
      alvo,
      gProt,
      gGord,
      gCarb,
      calProt,
      calGord,
      calCarb,
      calTotal,
      excede,
      imc,
      agua,
    };
  }

  function classifyImc(imc) {
    if (imc < 18.5) return "Abaixo do peso";
    if (imc < 25) return "Peso normal";
    if (imc < 30) return "Sobrepeso";
    if (imc < 35) return "Obesidade grau I";
    if (imc < 40) return "Obesidade grau II";
    return "Obesidade grau III";
  }

  /* ------------------------------------------------------------------------
     Validação e leitura do formulário
     ------------------------------------------------------------------------ */

  const RULES = {
    idade: { min: 14, max: 100, label: "sua idade", integer: true },
    peso: { min: 30, max: 300, label: "seu peso" },
    altura: { min: 120, max: 230, label: "sua altura", integer: true },
  };

  function setError(name, message) {
    const input = $(`#${name}`);
    const box = $(`[data-error-for="${name}"]`);
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
    if (box) box.textContent = message || "";
  }

  function validate() {
    let ok = true;
    let firstInvalid = null;

    for (const [name, rule] of Object.entries(RULES)) {
      const input = $(`#${name}`);
      const value = parseNumber(input.value);

      if (!input.value.trim()) {
        setError(name, `Informe ${rule.label}.`);
        ok = false;
      } else if (!Number.isFinite(value)) {
        setError(name, "Use apenas números.");
        ok = false;
      } else if (rule.integer && !Number.isInteger(value)) {
        setError(name, "Use um número inteiro.");
        ok = false;
      } else if (value < rule.min || value > rule.max) {
        setError(name, `Valor entre ${rule.min} e ${rule.max}.`);
        ok = false;
      } else {
        setError(name, "");
      }

      if (input.getAttribute("aria-invalid") === "true" && !firstInvalid) firstInvalid = input;
    }

    const prot = parseNumber($("#proteina").value);
    const gord = parseNumber($("#gordura").value);
    if (!Number.isFinite(prot) || prot < 0.5 || prot > 4) {
      showToast("Proteína deve ficar entre 0,5 e 4 g/kg.");
      ok = false;
    }
    if (!Number.isFinite(gord) || gord < 0.3 || gord > 2) {
      showToast("Gordura deve ficar entre 0,3 e 2 g/kg.");
      ok = false;
    }

    if (firstInvalid) firstInvalid.focus();

    return ok;
  }

  function readForm() {
    return {
      sexo: $('input[name="sexo"]:checked').value,
      peso: parseNumber($("#peso").value),
      altura: parseNumber($("#altura").value),
      idade: parseNumber($("#idade").value),
      fator: Number($("#atividade").value),
      objetivo: $('input[name="objetivo"]:checked').value,
      proteina: parseNumber($("#proteina").value),
      gordura: parseNumber($("#gordura").value),
    };
  }

  /* ------------------------------------------------------------------------
     Renderização
     ------------------------------------------------------------------------ */

  let lastResult = null;

  function render(data, result) {
    const card = $("#result");
    card.classList.remove("is-empty");
    $(".result-empty", card).hidden = true;
    const body = $(".result-body", card);
    body.hidden = false;

    $("#result-kicker").textContent =
      data.objetivo === "emagrecer"
        ? "Meta para emagrecimento"
        : data.objetivo === "ganhar"
          ? "Meta para ganho de massa"
          : "Meta para manutenção";

    animateNumber($("#result-kcal"), Math.round(result.alvo));

    const diff = Math.round(result.alvo - result.tdee);
    const diffLabel = diff === 0 ? "sem ajuste" : `${diff > 0 ? "+" : "−"}${nfInt.format(Math.abs(diff))} kcal`;
    $("#result-sub").textContent =
      `${GOAL_LABELS[data.objetivo]} · ${diffLabel} em relação ao seu gasto diário`;

    $("#stat-tmb").textContent = `${nfInt.format(result.tmb)} kcal`;
    $("#stat-tdee").textContent = `${nfInt.format(result.tdee)} kcal`;
    $("#stat-ajuste").textContent = diff === 0 ? "0 kcal" : `${diff > 0 ? "+" : "−"}${nfInt.format(Math.abs(diff))} kcal`;
    $("#stat-ajuste-label").textContent = diff === 0 ? "manutenção" : diff > 0 ? "superávit diário" : "déficit diário";

    // Macros
    const macros = [
      ["prot", result.gProt, result.calProt],
      ["gord", result.gGord, result.calGord],
      ["carb", result.gCarb, result.calCarb],
    ];
    for (const [key, grams, kcal] of macros) {
      $(`#macro-${key}-g`).textContent = `${nfInt.format(grams)} g`;
      $(`#macro-${key}-kcal`).textContent =
        `${nfInt.format(kcal)} kcal · ${Math.round((kcal / result.calTotal) * 100)}% do total`;
      const width = clamp((kcal / result.calTotal) * 100, 0, 100);
      $(`#bar-${key}`).style.width = `${width}%`;
    }
    $("#macro-kcal-total").textContent = `${nfInt.format(result.calProt + result.calGord + result.calCarb)} kcal em macros`;

    // IMC, água, ritmo
    $("#stat-imc").textContent = nf1.format(result.imc);
    $("#stat-imc-label").textContent = classifyImc(result.imc);
    $("#stat-agua").textContent = `${nf1.format(result.agua / 1000)} L`;

    if (data.objetivo === "emagrecer") {
      $("#stat-ritmo").textContent = "≈ 0,45 kg/sem";
      $("#stat-ritmo-label").textContent = "perda estimada";
    } else if (data.objetivo === "ganhar") {
      $("#stat-ritmo").textContent = "≈ 0,27 kg/sem";
      $("#stat-ritmo-label").textContent = "ganho estimado";
    } else {
      $("#stat-ritmo").textContent = "—";
      $("#stat-ritmo-label").textContent = "peso estável";
    }

    // Alertas
    const alerts = [];
    if (result.excede) {
      alerts.push({
        type: "danger",
        text: "A proteína e a gordura escolhidas já ultrapassam a meta calórica. Reduza os g/kg ou aumente a meta.",
      });
    }
    const piso = data.sexo === "fem" ? 1200 : 1500;
    if (result.alvo < piso) {
      alerts.push({
        type: "warn",
        text: `Sua meta ficou abaixo de ${nfInt.format(piso)} kcal, valor considerado mínimo para segurança na maioria dos casos. Procure um nutricionista antes de seguir.`,
      });
    }
    if (result.tdee > 4500 || result.tdee < 1000) {
      alerts.push({
        type: "warn",
        text: "O resultado está fora da faixa típica. Confira peso, altura, idade e nível de atividade.",
      });
    }

    const alertsBox = $("#alerts");
    alertsBox.innerHTML = "";
    for (const alert of alerts) {
      const el = document.createElement("div");
      el.className = `alert alert-${alert.type}`;
      el.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 4h.01M10.3 3.9 2.5 17.4A1.9 1.9 0 0 0 4.2 20.3h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${alert.text}</span>`;
      alertsBox.appendChild(el);
    }

    lastResult = { data, result };

    // Rola até o resultado no mobile
    if (window.matchMedia("(max-width: 960px)").matches) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ------------------------------------------------------------------------
     Histórico (localStorage)
     ------------------------------------------------------------------------ */

  function readHistory() {
    try {
      const raw = localStorage.getItem(STORAGE.history);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeHistory(list) {
    try {
      localStorage.setItem(STORAGE.history, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  function renderHistory() {
    const list = readHistory();
    const section = $("#historico");
    const ul = $("#history-list");
    const hint = $("#history-hint");

    if (!list.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    ul.innerHTML = list
      .map((item) => {
        const date = new Date(item.date);
        const dateLabel = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
        return `<li class="history-item" data-id="${item.id}">
          <strong>${nfInt.format(item.alvo)} kcal</strong>
          <span>${GOAL_LABELS[item.objetivo] || item.objetivo} · ${dateLabel}</span>
          <button class="del" type="button" aria-label="Remover cálculo de ${dateLabel}">×</button>
        </li>`;
      })
      .join("");

    hint.textContent =
      list.length >= FREE_HISTORY_LIMIT
        ? "No plano gratuito guardamos os 5 cálculos mais recentes. O Plano Pro terá histórico ilimitado."
        : "Salvo apenas neste navegador. Nada é enviado para servidores.";
  }

  function saveResult() {
    if (!lastResult) return;
    const { data, result } = lastResult;
    const list = readHistory();
    list.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      alvo: Math.round(result.alvo),
      tdee: Math.round(result.tdee),
      objetivo: data.objetivo,
      peso: data.peso,
    });
    const ok = writeHistory(list.slice(0, FREE_HISTORY_LIMIT));
    renderHistory();
    showToast(ok ? "Resultado salvo neste navegador." : "Não foi possível salvar (armazenamento cheio).");
  }

  /* ------------------------------------------------------------------------
     Compartilhar
     ------------------------------------------------------------------------ */

  async function shareResult() {
    if (!lastResult) return;
    const { data, result } = lastResult;
    const text =
      `Minha meta: ${nfInt.format(result.alvo)} kcal/dia para ${GOAL_LABELS[data.objetivo].toLowerCase()} ` +
      `(TDEE ${nfInt.format(result.tdee)} kcal). Calcule a sua:`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Caloria Certa", text, url: location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${location.href}`);
        showToast("Link copiado para a área de transferência.");
      } else {
        showToast("Copie o link da barra de endereços para compartilhar.");
      }
    } catch (error) {
      if (error.name !== "AbortError") showToast("Não foi possível compartilhar.");
    }
  }

  /* ------------------------------------------------------------------------
     Modal Pro
     ------------------------------------------------------------------------ */

  function setupProDialog() {
    const dialog = $("#pro-dialog");
    const waitlist = $("#waitlist-form");
    const success = $(".waitlist-success", dialog);

    $$("[data-open-pro]").forEach((btn) => {
      btn.addEventListener("click", () => {
        success.hidden = true;
        waitlist.hidden = false;
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      });
    });

    $(".dialog-close", dialog).addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    waitlist.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = $("#waitlist-email").value.trim();
      const goal = $("#waitlist-goal").value;

      // Sem backend: registra localmente. Substitua por Formspree/Buttondown quando publicar.
      try {
        const list = JSON.parse(localStorage.getItem(STORAGE.waitlist) || "[]");
        list.push({ email, goal, date: new Date().toISOString() });
        localStorage.setItem(STORAGE.waitlist, JSON.stringify(list));
      } catch {
        /* silencioso: modo privado pode bloquear o storage */
      }

      waitlist.hidden = true;
      success.hidden = false;
    });
  }

  /* ------------------------------------------------------------------------
     Inicialização
     ------------------------------------------------------------------------ */

  function init() {
    $("#year").textContent = String(new Date().getFullYear());

    // Dica do nível de atividade
    const activity = $("#atividade");
    const activityHint = $("#atividade-hint");
    const activityTexts = {
      "1.2": "Multiplicador 1,2 — pouco ou nenhum exercício.",
      "1.375": "Multiplicador 1,375 — 1 a 3 treinos por semana.",
      "1.55": "Multiplicador 1,55 — 3 a 5 treinos por semana.",
      "1.725": "Multiplicador 1,725 — 6 a 7 treinos por semana.",
      "1.9": "Multiplicador 1,9 — treino diário intenso ou trabalho físico.",
    };
    const updateHint = () => {
      activityHint.textContent = activityTexts[activity.value] || "";
    };
    activity.addEventListener("change", updateHint);
    updateHint();

    // Limpa erro ao digitar
    ["idade", "peso", "altura"].forEach((name) => {
      $(`#${name}`).addEventListener("input", () => setError(name, ""));
    });

    // Envio
    $("#tdee-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!validate()) return;
      const data = readForm();
      const result = calculate(data);
      render(data, result);
    });

    // Ações do resultado
    $("#btn-save").addEventListener("click", saveResult);
    $("#btn-share").addEventListener("click", shareResult);
    $("#btn-print").addEventListener("click", () => window.print());

    // Histórico
    $("#btn-clear-history").addEventListener("click", () => {
      writeHistory([]);
      renderHistory();
      showToast("Histórico apagado.");
    });

    $("#history-list").addEventListener("click", (event) => {
      const del = event.target.closest(".del");
      if (!del) return;
      const id = del.closest(".history-item").dataset.id;
      writeHistory(readHistory().filter((item) => item.id !== id));
      renderHistory();
    });

    $("#waitlist-email").addEventListener("input", () => {
      $("#waitlist-email").removeAttribute("aria-invalid");
    });

    setupProDialog();
    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
