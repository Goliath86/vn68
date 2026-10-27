// ── SEZIONI COLLASSABILI DEL PANNELLO SINISTRO ─────────────────────────
// Click sul titolo → nasconde il contenuto che lo segue (CSS
// .panel-title.collapsed + *); le sezioni chiuse, identificate dalla loro
// chiave data-i18n, restano chiuse anche nelle partite successive
const COLLAPSED_PANELS_KEY = "vn68_collapsed_panels";

function initPanelCollapse() {
  let closed = [];
  try {
    closed = JSON.parse(localStorage.getItem(COLLAPSED_PANELS_KEY)) || [];
  } catch (e) {}
  document.querySelectorAll("#left-panel .panel-title").forEach((title) => {
    const key = title.dataset.i18n;
    title.classList.add("collapsible");
    title.classList.toggle("collapsed", closed.includes(key));
    title.addEventListener("click", () => {
      title.classList.toggle("collapsed");
      closed = closed.filter((k) => k !== key);
      if (title.classList.contains("collapsed")) closed.push(key);
      try {
        localStorage.setItem(COLLAPSED_PANELS_KEY, JSON.stringify(closed));
      } catch (e) {}
    });
  });
}

// Bottoni azione mobile — delegano al corrispondente desktop
document
  .getElementById("mob-btn-move")
  .addEventListener("click", () => document.getElementById("btn-move").click());

document
  .getElementById("mob-btn-attack")
  .addEventListener("click", () =>
    document.getElementById("btn-attack").click(),
  );

document
  .getElementById("mob-btn-special")
  .addEventListener("click", () =>
    document.getElementById("btn-special").click(),
  );

document
  .getElementById("mob-btn-rotate")
  .addEventListener("click", () =>
    document.getElementById("btn-rotate").click(),
  );

document
  .getElementById("mob-btn-stance")
  .addEventListener("click", () =>
    document.getElementById("btn-stance").click(),
  );

document
  .getElementById("mob-btn-firstaid")
  .addEventListener("click", () =>
    document.getElementById("btn-firstaid").click(),
  );

document
  .getElementById("mob-btn-endturn")
  .addEventListener("click", () =>
    document.getElementById("btn-endturn").click(),
  );

document
  .getElementById("mob-btn-undo")
  .addEventListener("click", () => document.getElementById("btn-undo").click());

function objPanelHTML() {
  const type = G.missionType;
  const st = G.missionState;
  if (!type)
    return `<div style="font-size:11px;color:var(--paper-dark)">${t("objective_panel.no_mission")}</div>`;
  const mtype = MISSION_TYPES[type];
  let html = `<div style="font-family:var(--ui-font);font-size:13px;color:${mtype.color};font-weight:600;margin-bottom:6px">${mtype.icon} ${mtype.label}</div>`;
  if (type === "recon") {
    (st.points || []).forEach((pt, i) => {
      const lbl = missionObjLabel("recon", i) ?? pt.label;
      html += `<div class="obj-item"><div class="obj-dot" style="background:${pt.scouted ? "#44aa66" : "#88aaff"}"></div>${lbl} ${pt.scouted ? "✓" : ""}</div>`;
    });
  }
  if (type === "search_destroy") {
    html += `<div class="obj-item"><div class="obj-dot" style="background:#ff8888"></div>${t("objective_panel.kills", { kills: st.kills || 0, needed: st.needed || 0 })}</div>`;
  }
  if (type === "rescue_pilot") {
    let pilotStatus, pilotColor;
    if (st.pilotFound) {
      pilotColor = "#44aa66";
      pilotStatus = st.pilotExtracted
        ? t("objective_panel.pilot_extracted")
        : t("objective_panel.pilot_found");
    } else if (isTileVisible(st.pilotCol, st.pilotRow)) {
      pilotColor = "#ffcc44";
      pilotStatus = t("objective_panel.pilot_missing");
    } else {
      pilotColor = "#888";
      pilotStatus = t("objective_panel.pilot_unknown");
    }
    html += `<div class="obj-item"><div class="obj-dot" style="background:${pilotColor}"></div>${pilotStatus}</div>`;
  }
  if (type === "capture_objective") {
    (st.objectives || []).forEach((obj, i) => {
      const lbl = missionObjLabel("capture_objective", i) ?? obj.label;
      const status = obj.controlled
        ? t("objective_panel.hold_controlled", {
            label: lbl,
            held: obj.heldTurns || 0,
            total: obj.holdTurns || 2,
          })
        : t("objective_panel.hold_uncontrolled", {
            label: lbl,
            held: obj.heldTurns || 0,
            total: obj.holdTurns || 2,
          });
      html += `<div class="obj-item"><div class="obj-dot" style="background:${obj.controlled ? "#44aa66" : "#f0c030"}"></div>${status}</div>`;
    });
  }
  return html;
}

function updateObjectivePanel() {
  const html = objPanelHTML();
  document.getElementById("obj-panel").innerHTML = html;
  document.getElementById("mob-obj-panel").innerHTML = html;
}

// ── PANNELLO METEO ─────────────────────────────────────────────────────
// Icone SVG 40×40: sole, luna, nuvola (con sole/luna dietro), pioggia
const WX_SUN = `<g fill="#f0c030" stroke="#f0c030" stroke-width="2.5" stroke-linecap="round"><circle cx="20" cy="20" r="7" stroke="none"/><path d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5"/></g>`;
const WX_MOON = `<mask id="wx-moon-cut"><rect width="40" height="40" fill="#fff"/><circle cx="27" cy="14" r="11" fill="#000"/></mask><circle cx="19" cy="21" r="13" fill="#e8e0c0" mask="url(#wx-moon-cut)"/><circle cx="31" cy="30" r="1" fill="#e8e0c0"/><circle cx="35" cy="22" r="0.8" fill="#e8e0c0"/>`;
const wxCloud = (fill) =>
  `<g fill="${fill}"><circle cx="15" cy="24" r="7"/><circle cx="23" cy="19" r="9"/><circle cx="30" cy="25" r="6"/><rect x="8" y="24" width="28" height="7" rx="3.5"/></g>`;

function weatherIconSVG(sky, night) {
  let body;
  if (sky === "day") body = WX_SUN;
  else if (sky === "night") body = WX_MOON;
  else if (sky === "cloudy") {
    const behind = night
      ? `<g transform="translate(14 -2) scale(0.55)">${WX_MOON}</g>`
      : `<g transform="translate(13 -3) scale(0.6)">${WX_SUN}</g>`;
    body = behind + wxCloud(night ? "#7a8288" : "#b8c0c4");
  } else {
    body =
      `<g transform="translate(0 -4)">${wxCloud(night ? "#5a6268" : "#8a9296")}</g>` +
      `<path d="M14 31l-2 5M21 31l-2 5M28 31l-2 5" stroke="#6aa8e0" stroke-width="2" stroke-linecap="round"/>`;
  }
  return `<svg class="wx-icon" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">${body}</svg>`;
}

function weatherPanelHTML() {
  const w = G.mapData && G.missionType ? currentWeather() : null;
  if (!w) return `<div class="wx-empty">—</div>`;
  const label = t("weather." + (w.sky === "night" || w.sky === "day" ? "clear_" + w.sky : w.sky));
  return (
    `<div class="wx-row" title="${t("weather.tooltip")}">${weatherIconSVG(w.sky, w.night)}` +
    `<div class="wx-text"><div class="wx-temp">${w.temp}°C</div>` +
    `<div class="wx-label">${label} · ${t(w.night ? "weather.night" : "weather.day")}</div></div></div>`
  );
}

function updateWeatherPanel() {
  const html = weatherPanelHTML();
  for (const id of ["weather-panel", "mob-weather-panel"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}

function updateUI() {
  invalidateQuickActions();
  updateUnitList();
  updateSelInfo();
  updateActionButtons();
  updateObjectivePanel();
  updateWeatherPanel();
}

// ── PLAYER ACTION HANDLERS ─────────────────────────────────────────────
document.getElementById("btn-move").addEventListener("click", () => {
  if (!G.selectedUnit || G.selectedUnit.ap < 1) return;
  sfx("click");
  setActionMode("move");
});

// Attacca: modalità attacco con l'arma predefinita (le altre armi si scelgono
// dalle schede armi, o dal selettore della barra rapida su mobile)
document.getElementById("btn-attack").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!u || u.ap < 1 || !canAttack(u)) return;
  sfx("click");
  setActionMode("attack", defaultAttackWeapon(u));
});

// Scheda arma: attacca con quell'arma (secondo click: annulla); se l'arma è
// scarica e c'è riserva, ricarica
function weaponCardAction(idx) {
  const u = G.selectedUnit;
  const w = u?.weapons?.[idx];
  if (!w || !u.alive || G.phase !== "player") return;
  if (weaponEmpty(w)) {
    if (canReload(u, w)) reloadWeapon(u, w);
    return;
  }
  if (u.ap < 1 || !weaponUsable(u, w)) return;
  sfx("click");
  const again = G.actionMode === "attack" && G.currentWeapon === w;
  setActionMode(again ? null : "attack", again ? null : w);
}

document.getElementById("btn-special").addEventListener("click", () => {
  if (
    !G.selectedUnit ||
    G.selectedUnit.ap < 1 ||
    G.selectedUnit.specialUsed ||
    G.selectedUnit.shaken ||
    !unitSpecial(G.selectedUnit) ||
    specialBlockedByAmmo(G.selectedUnit)
  )
    return;

  const u = G.selectedUnit;
  if (unitSpecial(u) === "suppression") {
    // Fuoco Soppressivo immediato
    clearLastMove();
    u.suppression = true;
    u.ap -= 1;
    u.specialUsed = true;
    if (!G.suppressList.find((s) => s.id === u.id)) G.suppressList.push(u);
    sfx("overwatch");
    log(t("log.suppression_set", { name: u.name }), "system");
    tutorialEvent("special", { cls: u.cls, kind: "suppression" });
    updateUI();
    render();
    return;
  }

  if (unitSpecial(u) === "overwatch") {
    // Overwatch immediato
    clearLastMove();
    u.overwatch = true;
    u.ap -= 1;
    u.specialUsed = true;
    if (!G.overwatchList.find((o) => o.id === u.id)) G.overwatchList.push(u);
    sfx("overwatch");
    log(t("log.overwatch_set", { name: u.name }), "system");
    tutorialEvent("special", { cls: u.cls, kind: "overwatch" });
    updateUI();
    render();
    return;
  }
  setActionMode("special");
});
document.getElementById("btn-rotate").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!u || !u.alive || u.rotated) return;
  sfx("click");
  // Secondo click sul bottone: esce dalla modalità
  setActionMode(G.actionMode === "rotate" ? null : "rotate");
});

document.getElementById("btn-stance").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!canChangeStance(u)) return;
  sfx("click");
  // Secondo click sul bottone: chiude il selettore
  setActionMode(G.actionMode === "stance" ? null : "stance");
});

document.getElementById("btn-firstaid").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!canFirstAid(u)) return;
  firstAid(u);
});

document.getElementById("btn-undo").addEventListener("click", () => {
  if (!canUndoMove()) return;
  sfx("click");
  undoLastMove();
});

// ── FINE TURNO (con conferma se restano AP) ────────────────────────────
const endTurnOverlay = document.getElementById("endturn-overlay");

function requestEndTurn() {
  if (G.phase !== "player" || G.pendingDice || G.throwing) return;
  const withAp = G.units.filter((u) => u.alive && u.ap > 0).length;
  if (withAp > 0) {
    document.getElementById("endturn-msg").textContent = t(
      "confirm.end_turn_ap",
      { n: withAp },
    );
    endTurnOverlay.classList.remove("hidden");
    return;
  }
  endPlayerTurn();
}

function closeEndTurnConfirm(confirmed) {
  endTurnOverlay.classList.add("hidden");
  if (confirmed) endPlayerTurn();
}

document.getElementById("btn-endturn").addEventListener("click", requestEndTurn);
document
  .getElementById("endturn-yes")
  .addEventListener("click", () => closeEndTurnConfirm(true));
document
  .getElementById("endturn-no")
  .addEventListener("click", () => closeEndTurnConfirm(false));

// Seleziona la prossima unità viva con AP (dir = 1 avanti, -1 indietro)
function selectNextUnit(dir) {
  const list = G.units.filter((u) => u.alive && u.ap > 0);
  if (!list.length) return;
  const cur = list.indexOf(G.selectedUnit);
  const next =
    cur === -1
      ? list[dir > 0 ? 0 : list.length - 1]
      : list[(cur + dir + list.length) % list.length];
  G.selectedUnit = next;
  tutorialEvent("select", { cls: next.cls, col: next.col, row: next.row });
  setActionMode(null);
  updateUI();
}

// ── HOTKEYS DESKTOP ────────────────────────────────────────────────────
// Riepilogo mostrato dal menu (openKeysHelp): tenerlo allineato con lo
// switch qui sotto. Ogni voce: tasti ("+" = combinazione), chiave keys.*
const HOTKEY_HELP = [
  ["keyboard", [
    [["Tab"], "next_unit"],
    [["Shift+Tab"], "prev_unit"],
    [["M"], "move"],
    [["A"], "attack"],
    [["1", "9"], "weapon"],
    [["S"], "special"],
    [["R"], "rotate"],
    [["C"], "stance"],
    [["L"], "reload"],
    [["H"], "first_aid"],
    [["U", "Ctrl+Z"], "undo"],
    [["Esc"], "cancel"],
    [["Enter"], "end_turn"],
  ]],
  ["mouse", [
    [["mouse_left"], "click"],
    [["mouse_right_click"], "right_click"],
    [["mouse_right"], "pan"],
    [["mouse_wheel"], "zoom"],
  ]],
];

const keysOverlay = document.getElementById("keys-overlay");

function openKeysHelp() {
  // Tasti del mouse tradotti, gli altri scritti così come sono
  const kbd = (k) =>
    k.startsWith("mouse_")
      ? `<kbd>${t(`keys.${k}`)}</kbd>`
      : k.split("+").map((p) => `<kbd>${p}</kbd>`).join("+");
  document.getElementById("keys-list").innerHTML = HOTKEY_HELP.map(
    ([section, rows]) => `
      <h3>${t(`keys.${section}`)}</h3>
      <table>${rows
        .map(([keys, label]) => {
          // 1–9: intervallo; altrimenti alternative separate da "/"
          const k = label === "weapon" ? keys.map(kbd).join("–") : keys.map(kbd).join(" / ");
          return `<tr><td>${k}</td><td>${t(`keys.${label}`)}</td></tr>`;
        })
        .join("")}</table>`,
  ).join("");
  keysOverlay.classList.remove("hidden");
  sfx("click");
}

function closeKeysHelp() {
  keysOverlay.classList.add("hidden");
}

document.getElementById("btn-keys-help").addEventListener("click", openKeysHelp);
document.getElementById("keys-close").addEventListener("click", closeKeysHelp);
keysOverlay.addEventListener("click", (e) => {
  if (e.target === keysOverlay) closeKeysHelp();
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  // Riepilogo comandi aperto: Esc/Invio lo chiudono, altri tasti ignorati
  if (!keysOverlay.classList.contains("hidden")) {
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      closeKeysHelp();
    }
    return;
  }
  // Conferma fine turno aperta: Invio = sì, Esc = no, altri tasti ignorati
  if (!endTurnOverlay.classList.contains("hidden")) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      closeEndTurnConfirm(e.key === "Enter");
    }
    return;
  }
  if (!G.mapData || G.phase !== "player" || G.pendingDice || G.throwing) return;
  const u = G.selectedUnit;
  if (e.key === "Tab") {
    e.preventDefault();
    selectNextUnit(e.shiftKey ? -1 : 1);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    document.getElementById("btn-undo").click();
    return;
  }
  switch (e.key.toLowerCase()) {
    case "u":
      document.getElementById("btn-undo").click();
      break;
    case "m":
      if (u && u.alive && u.ap > 0) document.getElementById("btn-move").click();
      break;
    case "a":
      if (u && u.alive && u.ap > 0 && canAttack(u))
        document.getElementById("btn-attack").click();
      break;
    case "s":
      if (u && u.alive && u.ap > 0 && !u.specialUsed && unitSpecial(u))
        document.getElementById("btn-special").click();
      break;
    case "r":
      if (u && u.alive && !u.rotated) document.getElementById("btn-rotate").click();
      break;
    case "c":
      if (canChangeStance(u)) document.getElementById("btn-stance").click();
      break;
    case "l":
      if (canReload(u)) reloadWeapon(u);
      break;
    case "h":
      if (canFirstAid(u)) document.getElementById("btn-firstaid").click();
      break;
    case "enter":
      // preventDefault: evita il doppio click nativo se un bottone ha il focus
      e.preventDefault();
      document.getElementById("btn-endturn").click();
      break;
    case "escape":
      if (G.actionMode) {
        setActionMode(null);
        sfx("click");
      }
      break;
    default:
      // 1-9: scheda arma corrispondente
      if (/^[1-9]$/.test(e.key) && u?.weapons?.[+e.key - 1])
        weaponCardAction(+e.key - 1);
  }
});
