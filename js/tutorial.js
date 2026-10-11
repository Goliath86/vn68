// ── ADDESTRAMENTO (TUTORIAL) ───────────────────────────────────────────
// Lezioni guidate: normali mappe JSON in missions/tutorial/ con squadra e VC
// fissi ("squad", "enemies") e un blocco "tutorial" con i passi:
//   "tutorial": { "missionType": "...", "steps": [
//     { "id": "intro", "until": "next" },                       // bottone Avanti
//     { "id": "move", "until": { "event": "move", "at": {col,row}, "within": 0 },
//       "highlight": {col,row}, "ui": ["btn-move"] },
//     { "id": "finish" } ] }                                    // ultimo: obiettivo
// I testi dei passi stanno nelle traduzioni della mappa: translations.<lang>.tutorial.<id>.
// Il gioco segnala le azioni del giocatore con tutorialEvent(evento, dati); un
// passo si completa quando un evento registrato soddisfa il suo "until" (campi
// uguali, "at"/"within" sulla posizione). Gli eventi già avvenuti contano anche
// per i passi successivi (si possono anticipare), tranne endTurn/turnStart e i
// passi con "fresh": true, che valgono solo da quando il passo è iniziato.
// L'indice delle lezioni (missions/tutorial/index.json) contiene anche i tipi
// di tile e le loro etichette, condivisi da tutte le lezioni.
const TUTORIAL_INDEX_PATH = "missions/tutorial/index.json";
const TUTORIAL_DONE_KEY = "vn68_tutorial_done";
const TUTORIAL_FRESH_EVENTS = new Set(["endTurn", "turnStart"]);
const TUTORIAL_LOG_MAX = 300;
let TUTORIAL_INDEX = null;

async function loadTutorialIndex() {
  if (!TUTORIAL_INDEX) {
    const resp = await fetch(TUTORIAL_INDEX_PATH);
    TUTORIAL_INDEX = await resp.json();
  }
  return TUTORIAL_INDEX;
}

function tutorialDoneSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(TUTORIAL_DONE_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function markTutorialDone(id) {
  const done = tutorialDoneSet();
  done.add(id);
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, JSON.stringify([...done]));
  } catch (e) {}
}

function lessonText(lesson, field) {
  return lesson.labels?.[LANG]?.[field] ?? lesson.labels?.it?.[field] ?? "";
}

// ── Finestra delle lezioni ─────────────────────────────────────────────
async function openTutorialModal() {
  document.getElementById("modal-overlay").style.display = "none";
  const overlay = document.getElementById("tutorial-overlay");
  overlay.classList.remove("hidden");
  const list = document.getElementById("tutorial-list");
  const startBtn = document.getElementById("btn-tutorial-start");
  list.innerHTML = `<div class="tut-loading">${t("modal.loading")}</div>`;
  startBtn.disabled = true;

  document.getElementById("btn-tutorial-back").onclick = () => {
    overlay.classList.add("hidden");
    initModal();
  };

  let index;
  try {
    index = await loadTutorialIndex();
  } catch (err) {
    list.textContent = t("errors.map_load_failed", { message: err.message });
    return;
  }

  const done = tutorialDoneSet();
  let selected = null;
  list.innerHTML = "";
  index.lessons.forEach((lesson, i) => {
    const classes = (lesson.classes || [])
      .map((c) => UNIT_CLASSES[c])
      .filter(Boolean)
      .map(
        (d) =>
          `<span class="tut-class" style="background:${d.color}" title="${d.name}">${d.symbol}</span>`,
      )
      .join("");
    const div = document.createElement("div");
    div.className = "mission-option tut-lesson";
    div.innerHTML = `
      <div class="mission-icon">${lesson.icon || "🎓"}</div>
      <div style="flex:1">
        <div class="mname">${i + 1}. ${lessonText(lesson, "title")} ${done.has(lesson.id) ? '<span class="tut-done">✓</span>' : ""}</div>
        <div class="mdesc">${lessonText(lesson, "desc")}</div>
      </div>
      <div class="tut-classes">${classes}</div>`;
    div.addEventListener("click", () => {
      list.querySelectorAll(".mission-option").forEach((el) => el.classList.remove("active"));
      div.classList.add("active");
      selected = lesson;
      startBtn.disabled = false;
      sfx("click");
    });
    list.appendChild(div);
  });

  startBtn.onclick = async () => {
    if (!selected) return;
    startBtn.disabled = true;
    await startTutorialLesson(selected);
  };
}

// Carica e avvia una lezione
async function startTutorialLesson(lesson) {
  const index = await loadTutorialIndex();
  const resp = await fetch("missions/tutorial/" + lesson.file);
  const data = await resp.json();

  // Tile e loro etichette condivisi dall'indice (la lezione può sovrascriverli)
  data.tileTypes = { ...(index.tileTypes || {}), ...(data.tileTypes || {}) };
  data.translations = data.translations || {};
  for (const [lang, labels] of Object.entries(index.tileLabels || {})) {
    const tr = (data.translations[lang] = data.translations[lang] || {});
    tr.tileLabels = { ...labels, ...(tr.tileLabels || {}) };
  }
  // Niente casualità: trappole, tunnel e imboscate solo se la lezione li prevede
  data.trapCount ??= 0;
  data.tunnelCount ??= 0;
  data.vcTrapPlantMax ??= 0;
  data.ambushChance ??= 0;
  data.vcSpawnZones ??= [];
  data.playerStart ??= data.squad.map((s) => ({ col: s.col, row: s.row }));
  data.supportedMissions ??= [data.tutorial.missionType];
  data.tutorial.lessonId = lesson.id;

  document.getElementById("tutorial-overlay").classList.add("hidden");
  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("modal-overlay").style.display = "none";
  await ambientFadeOut(600);
  useMission(data);
  startGame(data.tutorial.missionType, undefined, { night: !!data.night });
  G.missionState.tutorialStep = 0;
  G.missionState.tutorialStepSeq = 0;
  G.missionState.tutorialSeq = 0;
  G.missionState.tutorialLog = [];
  renderTutorialPanel();
  render();
}

// Lezione successiva a quella in corso (null se è l'ultima)
function nextTutorialLesson() {
  const id = G.mapData?.tutorial?.lessonId;
  const lessons = TUTORIAL_INDEX?.lessons || [];
  const i = lessons.findIndex((l) => l.id === id);
  return i >= 0 ? (lessons[i + 1] ?? null) : null;
}

// ── Passi e avanzamento ────────────────────────────────────────────────
function tutorialActive() {
  return !!G.mapData?.tutorial && !!G.missionState && G.phase !== "gameover";
}

function currentTutorialStep() {
  const steps = G.mapData?.tutorial?.steps || [];
  return steps[G.missionState?.tutorialStep ?? 0] ?? null;
}

function tutorialMatches(until, event, data) {
  if (!until || until === "next" || until.event !== event) return false;
  for (const [k, v] of Object.entries(until)) {
    if (k === "event" || k === "at" || k === "within") continue;
    if (Array.isArray(v) ? !v.includes(data[k]) : data[k] !== v) return false;
  }
  if (until.at) {
    if (data.col == null || dist(data, until.at) > (until.within ?? 0)) return false;
  }
  return true;
}

// Azione del giocatore (o momento del turno) rilevante per il tutorial
function tutorialEvent(event, data = {}) {
  if (!tutorialActive()) return;
  const ms = G.missionState;
  ms.tutorialLog = ms.tutorialLog || [];
  ms.tutorialSeq = (ms.tutorialSeq || 0) + 1;
  ms.tutorialLog.push({ ...data, event, seq: ms.tutorialSeq });
  if (ms.tutorialLog.length > TUTORIAL_LOG_MAX) ms.tutorialLog.shift();
  checkTutorialProgress();
}

// Avanza finché il passo corrente risulta già completato
function checkTutorialProgress() {
  const ms = G.missionState;
  let advanced = false;
  for (;;) {
    const step = currentTutorialStep();
    if (!step?.until || step.until === "next") break;
    const since =
      step.fresh || TUTORIAL_FRESH_EVENTS.has(step.until.event) ? ms.tutorialStepSeq || 0 : 0;
    const hit = (ms.tutorialLog || []).some(
      (e) => e.seq > since && tutorialMatches(step.until, e.event, e),
    );
    if (!hit) break;
    ms.tutorialStep++;
    ms.tutorialStepSeq = ms.tutorialSeq || 0;
    advanced = true;
  }
  if (advanced) {
    ms.tutorialHidden = false;
    sfx("click");
    renderTutorialPanel();
    render();
  }
}

function advanceTutorialManually() {
  const ms = G.missionState;
  ms.tutorialStep++;
  ms.tutorialStepSeq = ms.tutorialSeq || 0;
  sfx("click");
  renderTutorialPanel();
  checkTutorialProgress();
  render();
}

// ── Pannello dell'istruttore ───────────────────────────────────────────
// Testo dei passi: **grassetto** e a capo
function formatTutorialText(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

// Elementi da evidenziare, con le versioni mobile ("mob-<id>") e, per i
// bottoni "btn-x", quelli della barra rapida ("qb-x")
function tutorialUiTargets(ids) {
  const out = [];
  for (const id of ids || []) {
    out.push(id, "mob-" + id);
    if (id.startsWith("btn-")) out.push("qb-" + id.slice(4));
  }
  return out;
}

function renderTutorialPanel() {
  const el = document.getElementById("tutorial-panel");
  if (!el) return;
  document.querySelectorAll(".tut-pulse").forEach((b) => b.classList.remove("tut-pulse"));
  if (!tutorialActive()) {
    el.classList.add("hidden");
    return;
  }
  const steps = G.mapData.tutorial.steps;
  const i = Math.min(G.missionState.tutorialStep ?? 0, steps.length - 1);
  const step = steps[i];
  const hidden = !!G.missionState.tutorialHidden;
  el.classList.remove("hidden");
  el.classList.toggle("collapsed", hidden);
  const text = formatTutorialText(mt(`tutorial.${step.id}`) ?? step.id);
  el.innerHTML = `
    <div class="tut-head">
      <span>🎖 ${t("tutorial.instructor")}</span>
      <span class="tut-count">${t("tutorial.step", { n: i + 1, total: steps.length })}</span>
      <button class="tut-toggle" title="${t(hidden ? "tutorial.show" : "tutorial.hide")}">${hidden ? "▴" : "▾"}</button>
    </div>
    <div class="tut-body">
      <div class="tut-text">${text}</div>
      ${step.until === "next" ? `<button class="btn tut-next">${t("tutorial.next")}</button>` : ""}
    </div>`;
  el.querySelector(".tut-toggle").onclick = () => {
    G.missionState.tutorialHidden = !hidden;
    renderTutorialPanel();
  };
  el.querySelector(".tut-next")?.addEventListener("click", advanceTutorialManually);
  if (!hidden)
    for (const id of tutorialUiTargets(step.ui)) document.getElementById(id)?.classList.add("tut-pulse");
}

// Tile evidenziato dal passo corrente (chiamato da renderOverlay)
function drawTutorialMarker(ctx, ts) {
  if (!tutorialActive()) return;
  const h = currentTutorialStep()?.highlight;
  if (!h) return;
  const { x, y } = tileToScreen(h.col, h.row);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  ctx.save();
  ctx.strokeStyle = `rgba(255,220,60,${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = Math.max(2, ts * 0.06);
  ctx.setLineDash([ts * 0.12, ts * 0.08]);
  ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
  ctx.setLineDash([]);
  // Freccia sopra il tile
  const cx = x + ts / 2,
    top = y - ts * (0.12 + 0.06 * pulse);
  ctx.fillStyle = "rgba(255,220,60,0.95)";
  ctx.beginPath();
  ctx.moveTo(cx, top + ts * 0.1);
  ctx.lineTo(cx - ts * 0.12, top - ts * 0.08);
  ctx.lineTo(cx + ts * 0.12, top - ts * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Fine lezione ───────────────────────────────────────────────────────
// Chiamato da showGameOver: segna la lezione superata e propone la successiva
function tutorialGameOver(win) {
  const btn = document.getElementById("btn-next-lesson");
  if (!btn) return;
  btn.classList.add("hidden");
  const tut = G.mapData?.tutorial;
  if (!tut) return;
  document.getElementById("tutorial-panel")?.classList.add("hidden");
  if (!win) return;
  markTutorialDone(tut.lessonId);
  // L'indice può mancare se la lezione è stata ripresa da un salvataggio
  loadTutorialIndex()
    .then(() => {
      const next = nextTutorialLesson();
      if (!next) return;
      btn.textContent = t("tutorial.next_lesson", { title: lessonText(next, "title") });
      btn.classList.remove("hidden");
      btn.onclick = () => startTutorialLesson(next);
    })
    .catch(() => {});
}
