// ── MENU DESKTOP ───────────────────────────────────────────────────────
// Su schermi ampi (isDesktopMenu) il menu iniziale è a due colonne: a
// sinistra le voci Riprendi / Addestramento / Missioni singole / Campagne /
// Opzioni, che si aprono a fisarmonica con i loro elenchi; a destra
// l'immagine del gioco (config.json "menuImage") con titolo e versione. Il
// briefing di una mappa (#modal-step-mission di initModal.js, spostato qui)
// compare in una scheda sopra l'immagine. Su mobile resta il menu a passi.
// initModal chiama setupMenuLayout alla fine: le schede e i banner del menu
// mobile vengono costruiti comunque, ma restano nascosti.
const MENU_SECTION_KEY = "vn68_menu_section";
const MENU_IMAGE_DEFAULT = "assets/menu_hero.jpg";
let _menuDesktopMode = null;
let _menuSection = null;

const _mEl = (id) => document.getElementById(id);
const _mEsc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function isDesktopMenu() {
  return window.matchMedia("(min-width: 900px) and (min-height: 560px)").matches;
}

// Dispone il menu per desktop o mobile; restituisce true se desktop
function setupMenuLayout() {
  const desk = isDesktopMenu();
  _menuDesktopMode = desk;
  const box = _mEl("modal-box");
  const step = _mEl("modal-step-mission");
  box.classList.toggle("menu-desktop", desk);
  _mEl("menu-desktop").classList.toggle("hidden", !desk);
  // Il briefing vive nella scheda a destra su desktop, nel riquadro su mobile
  if (desk) _mEl("menu-panel").appendChild(step);
  else if (step.parentElement !== box) box.insertBefore(step, _mEl("btn-keys-help"));
  closeMenuPanel();
  if (!desk) return false;
  _mEl("modal-step-map").style.display = "none";
  _mEl("btn-back-map").onclick = closeMenuPanel;
  const img = CONFIG.menuImage || MENU_IMAGE_DEFAULT;
  _mEl("menu-main").style.backgroundImage =
    `linear-gradient(90deg, rgba(10,16,6,0.55), rgba(10,16,6,0) 35%), ` +
    `linear-gradient(0deg, rgba(10,16,6,0.85), rgba(10,16,6,0) 45%), url("${assetUrl(img)}")`;
  renderDesktopMenu();
  return true;
}

// Cambio di larghezza della finestra a menu aperto: si ridispone
window.addEventListener("resize", () => {
  if (_menuDesktopMode === null || _mEl("modal-overlay").style.display === "none") return;
  if (isDesktopMenu() !== _menuDesktopMode) initModal();
});

function openMenuPanel() {
  _mEl("menu-panel").classList.remove("hidden");
  _mEl("menu-main").classList.add("panel-open");
  _mEl("modal-step-mission").style.display = "block";
}

function closeMenuPanel() {
  _mEl("menu-panel").classList.add("hidden");
  _mEl("menu-main").classList.remove("panel-open");
  _mEl("modal-step-mission").style.display = "none";
  document.querySelectorAll("#menu-nav .menu-item.active").forEach((x) => x.classList.remove("active"));
}

// ── Voci ───────────────────────────────────────────────────────────────
function menuSaveKeys() {
  const keys = [];
  if (loadSave(SAVE_KEY)) keys.push(SAVE_KEY);
  if (loadCampaign()?.inProgress && loadSave(CAMPAIGN_SAVE_KEY)) keys.push(CAMPAIGN_SAVE_KEY);
  return keys;
}

function renderDesktopMenu() {
  const nav = _mEl("menu-nav");
  const saves = menuSaveKeys();
  const card = (flag) => MAPS.find((m) => m[flag]);
  const sections = [
    saves.length && { id: "resume", icon: "▶", label: t("menu.resume"), build: (l) => buildResumeItems(l, saves) },
    card("tutorial") && { id: "tutorial", icon: card("tutorial").icon, label: card("tutorial").label, build: buildTutorialItems },
    { id: "missions", icon: "🗺", label: t("menu.missions"), build: buildMissionItems },
    card("campaign") && { id: "campaigns", icon: card("campaign").icon, label: t("menu.campaigns"), build: buildCampaignItems },
    { id: "options", icon: "⚙", label: t("menu.options"), build: buildOptionItems },
  ].filter(Boolean);
  // Voce aperta: l'ultima scelta, oppure Riprendi se c'è un salvataggio
  let saved = null;
  try {
    saved = localStorage.getItem(MENU_SECTION_KEY);
  } catch (e) {}
  if (!sections.some((s) => s.id === _menuSection)) _menuSection = null;
  _menuSection ??= saves.length ? "resume" : sections.some((s) => s.id === saved) ? saved : "missions";

  nav.innerHTML = "";
  for (const sec of sections) {
    const wrap = document.createElement("div");
    wrap.className = "menu-sec" + (sec.id === _menuSection ? " open" : "");
    wrap.innerHTML = `
      <button class="menu-sec-head"><span class="ms-icon">${sec.icon}</span><span>${_mEsc(sec.label)}</span><span class="ms-arrow">▸</span></button>
      <div class="menu-sec-list"></div>`;
    const list = wrap.querySelector(".menu-sec-list");
    wrap.querySelector(".menu-sec-head").onclick = () => {
      sfx("click");
      _menuSection = _menuSection === sec.id ? null : sec.id;
      try {
        if (_menuSection) localStorage.setItem(MENU_SECTION_KEY, _menuSection);
      } catch (e) {}
      closeMenuPanel();
      renderDesktopMenu();
    };
    if (sec.id === _menuSection) sec.build(list);
    nav.appendChild(wrap);
  }
}

// Riga di un elenco: icona, titolo, sottotitolo, eventuale etichetta a destra
function menuItem(list, { icon = "", title, sub = "", tag = "", onClick, disabled = false }) {
  const b = document.createElement("button");
  b.className = "menu-item";
  b.disabled = disabled;
  b.innerHTML = `
    ${icon ? `<span class="mi-icon">${icon}</span>` : ""}
    <span class="mi-text"><span class="mi-title">${title}</span>${sub ? `<span class="mi-sub">${sub}</span>` : ""}</span>
    ${tag ? `<span class="mi-tag">${tag}</span>` : ""}`;
  if (onClick) b.onclick = () => onClick(b);
  list.appendChild(b);
  return b;
}

const _menuLoading = (list) => (list.innerHTML = `<div class="mi-sub">${t("modal.loading")}</div>`);

function buildResumeItems(list, keys) {
  for (const key of keys) {
    const save = loadSave(key);
    const info = saveInfo(save, key);
    const sub = [
      `${_mEsc(info.mapName)} · ${_mEsc(info.missionLabel)} · ${t("modal.resume_turn", { turn: save.turn })}`,
      _mEsc(info.savedDate),
      info.missingMods.length ? `<span class="cmp-bad">${t("mods.save_missing", { mods: _mEsc(info.missingMods.join(", ")) })}</span>` : "",
    ].filter(Boolean).join("<br>");
    menuItem(list, {
      icon: key === CAMPAIGN_SAVE_KEY ? "🎖" : "▶",
      title: _mEsc(info.title),
      sub: sub + `<span class="gen-bar hidden"><span class="gen-fill"></span></span>`,
      disabled: info.missingMods.length > 0,
      onClick: async (b) => {
        sfx("click");
        b.disabled = true;
        if (!save.mapData.image) b.querySelector(".gen-bar").classList.remove("hidden");
        await resumeFromSave(key, (p) => {
          b.querySelector(".gen-fill").style.width = `${Math.round(p * 100)}%`;
        });
      },
    });
  }
}

async function buildTutorialItems(list) {
  _menuLoading(list);
  let index;
  try {
    index = await loadTutorialIndex();
  } catch (err) {
    list.innerHTML = `<div class="mi-sub load-error">${_mEsc(t("errors.map_load_failed", { message: err.message }))}</div>`;
    return;
  }
  list.innerHTML = "";
  const done = tutorialDoneSet();
  index.lessons.forEach((lesson, i) => {
    menuItem(list, {
      icon: lesson.icon || "🎓",
      title: `${i + 1}. ${_mEsc(lessonText(lesson, "title"))}`,
      sub: _mEsc(lessonText(lesson, "desc")),
      tag: done.has(lesson.id) ? '<span class="tut-done">✓</span>' : "",
      onClick: async (b) => {
        sfx("click");
        b.disabled = true;
        try {
          await startTutorialLesson(lesson);
        } catch (err) {
          b.disabled = false;
          const msg = document.createElement("div");
          msg.className = "mi-sub load-error";
          showLoadError(msg, err);
          b.after(msg);
        }
      },
    });
  });
}

function buildMissionItems(list) {
  for (const m of MAPS.filter((x) => !x.tutorial && !x.campaign)) {
    menuItem(list, {
      icon: m.icon,
      title: _mEsc(m.label),
      sub: _mEsc(m.subtitle),
      tag: m.theater
        ? `<span class="map-theater" style="background:${m.theaterColor}22;color:${m.theaterColor};border:1px solid ${m.theaterColor}66">${_mEsc(m.theater)}</span>`
        : "",
      onClick: async (b) => {
        sfx("click");
        list.querySelectorAll(".menu-item").forEach((x) => x.classList.toggle("active", x === b));
        openMenuPanel();
        await loadMissionStep(m);
      },
    });
  }
}

async function buildCampaignItems(list) {
  _menuLoading(list);
  const st = loadCampaign();
  const files = await campaignFileList();
  const defs = await Promise.all(
    files.map((f) => loadCampaignDef(f).then((def) => ({ f, def }), (err) => ({ f, err }))),
  );
  list.innerHTML = "";
  if (st && !st.result) {
    menuItem(list, {
      icon: "▶",
      title: t("menu.campaign_continue", { name: _mEsc(campaignName(st.def, st.file)) }),
      sub: t("campaign.in_progress", { n: st.opIndex + 1, total: st.ops.length, men: st.roster.length }),
      onClick: () => {
        sfx("click");
        openCampaignModal();
      },
    });
  }
  for (const { f, def, err } of defs) {
    if (err) {
      const msg = document.createElement("div");
      msg.className = "mi-sub load-error";
      showLoadError(msg, err);
      list.appendChild(msg);
      continue;
    }
    const count = def.procedural ? def.procedural.operations || 5 : (def.operations || []).length;
    menuItem(list, {
      icon: _mEsc(def.icon || "🎖"),
      title: _mEsc(campaignName(def, f)),
      sub: `${_mEsc(campaignText(def, "description") ?? "")}<br>${t(def.procedural ? "campaign.ops_procedural" : "campaign.ops_count", { n: count })}`,
      onClick: () => {
        sfx("click");
        // Con una campagna in corso: l'elenco della campagna chiede conferma
        if (st && !st.result) return openCampaignModal("list");
        CAMPAIGN = newCampaignState(def, f);
        saveCampaign();
        openCampaignModal();
      },
    });
  }
}

function buildOptionItems(list) {
  const rerender = () => {
    list.innerHTML = "";
    buildOptionItems(list);
  };
  // Lingua: due pulsanti nella riga
  const lang = menuItem(list, {
    icon: "🌐",
    title: t("menu.language"),
    tag: SUPPORTED_LANGS.map(
      (l) => `<span class="lang-btn ${l === LANG ? "active" : ""}" data-lang="${l}">${l.toUpperCase()}</span>`,
    ).join(""),
  });
  lang.querySelectorAll("[data-lang]").forEach((s) => {
    s.onclick = (e) => {
      e.stopPropagation();
      setLang(s.dataset.lang);
    };
  });
  menuItem(list, {
    icon: AUDIO.muted ? "🔇" : "🔊",
    title: t("menu.audio"),
    tag: t(AUDIO.muted ? "menu.off" : "menu.on"),
    onClick: () => {
      audioToggleMute();
      if (!AUDIO.muted && CONFIG.menuMusic && !AUDIO.ambient) ambientPlay(CONFIG.menuMusic);
      rerender();
    },
  });
  menuItem(list, {
    icon: "🍃",
    title: t("menu.wind"),
    sub: t("menu.wind_desc"),
    tag: t(G.windEnabled ? "menu.on" : "menu.off"),
    onClick: () => {
      sfx("click");
      toggleWind();
      rerender();
    },
  });
  if (MOD_LIST.length)
    menuItem(list, {
      icon: "🧩",
      title: t("menu.mods"),
      sub: t("menu.mods_desc", { n: ACTIVE_MODS.length }),
      onClick: () => {
        sfx("click");
        openModsMenu();
      },
    });
  menuItem(list, {
    icon: "⌨",
    title: t("menu.keys"),
    onClick: () => {
      sfx("click");
      openKeysHelp();
    },
  });
}
