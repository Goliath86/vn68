function initModal() {
  document.getElementById("modal-overlay").style.display = "flex";
  document.getElementById("modal-step-map").style.display = "";
  document.getElementById("modal-step-mission").style.display = "none";
  document.getElementById("btn-select-map").disabled = true;
  document.getElementById("btn-menu").style.display = "none";
  document.getElementById("tutorial-overlay").classList.add("hidden");
  document.getElementById("tutorial-panel").classList.add("hidden");
  document.getElementById("campaign-overlay").classList.add("hidden");
  document.getElementById("btn-mods").style.display = MOD_LIST.length ? "" : "none";

  // "Resume game" banner if a savegame exists: partita libera e operazione
  // di una campagna (salvataggi separati, saveGame.js:currentSaveKey)
  document.querySelectorAll(".resume-banner").forEach((el) => el.remove());
  addResumeBanner(SAVE_KEY);
  // Operazione salvata solo se la campagna la aspetta ancora
  if (loadCampaign()?.inProgress) addResumeBanner(CAMPAIGN_SAVE_KEY);

  const grid = document.getElementById("map-select-grid");
  grid.innerHTML = "";
  let selectedMap = null;

  // Map cards
  MAPS.forEach((m) => {
    const card = document.createElement("div");
    card.className = m.tutorial || m.campaign ? "map-card tutorial-card" : "map-card";
    if (m.tutorial || m.campaign) {
      // Addestramento e campagna: aprono direttamente la loro finestra
      card.innerHTML = `
        <div class="map-icon">${m.icon}</div>
        <div class="map-name">${m.label}</div>
        <div class="map-sub">${m.subtitle}</div>`;
      card.addEventListener("click", () => {
        sfx("click");
        if (m.campaign) openCampaignModal();
        else openTutorialModal();
      });
      grid.appendChild(card);
      return;
    }
    card.innerHTML = `
      <div class="map-icon">${m.icon}</div>
      <div class="map-name">${m.label}</div>
      <div class="map-sub">${m.subtitle}</div>
      <div class="map-theater" style="background:${m.theaterColor}22;color:${m.theaterColor};border:1px solid ${m.theaterColor}66">${m.theater}</div>
    `;
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".map-card")
        .forEach((el) => el.classList.remove("active"));
      card.classList.add("active");
      selectedMap = m;
      document.getElementById("btn-select-map").disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById("btn-select-map").onclick = async () => {
    if (!selectedMap) return;
    document.getElementById("modal-step-map").style.display = "none";
    document.getElementById("modal-step-mission").style.display = "block";
    await loadMissionStep(selectedMap);
  };

  document.getElementById("btn-back-map").onclick = () => {
    document.getElementById("modal-step-map").style.display = "";
    document.getElementById("modal-step-mission").style.display = "none";
    document.getElementById("btn-select-map").disabled = true;
    document
      .querySelectorAll(".map-card")
      .forEach((el) => el.classList.remove("active"));
    selectedMap = null;
  };

  // Schermi ampi: menu a due colonne (mainMenu.js), che riusa il briefing
  setupMenuLayout();
}

// Dati di un salvataggio per il banner "riprendi" (e il menu desktop,
// mainMenu.js): titolo, mappa, missione, data, mod mancanti
function saveInfo(save, key) {
  const campaign = key === CAMPAIGN_SAVE_KEY;
  // Partita salvata con mod ora spente: si riprende solo riattivandole
  const missingMods = missingSaveMods(save).map((id) => {
    const m = MOD_LIST.find((x) => x.id === id);
    return m ? modLabels(m).name : id;
  });
  return {
    title: campaign
      ? t("campaign.resume_banner", { op: campaignOpName(CAMPAIGN, save.missionState?.campaign?.opIndex ?? CAMPAIGN.opIndex) })
      : t("modal.resume_title"),
    // Nome nella lingua attuale, non in quella del salvataggio
    mapName: save.mapData?.translations?.[LANG]?.name?.toUpperCase() ?? save.mapName,
    missionLabel: MISSION_TYPES[save.missionType]?.label || save.missionType,
    savedDate: new Date(save.savedAt).toLocaleString(),
    missingMods,
  };
}

// Riprende un salvataggio: terreno procedurale disegnato a passi
// (render.js:prebuildTerrainCache) mentre la musica sfuma
async function resumeFromSave(key, onProgress) {
  const s = loadSave(key);
  if (!s) return;
  await Promise.all([ambientFadeOut(800), prebuildTerrainCache(s.mapData, onProgress)]);
  resumeGame(s);
}

// Banner "riprendi" di un salvataggio (key: partita libera o campagna)
function addResumeBanner(key) {
  const save = loadSave(key);
  if (!save) return;
  const { title, mapName, missionLabel, savedDate, missingMods } = saveInfo(save, key);

  const banner = document.createElement("div");
  banner.className = "resume-banner";
  banner.style.cssText =
    "background:#1a2a12;border:1px solid #5a8a30;border-radius:3px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;";
  banner.innerHTML = `
    <div style="text-align:left;line-height:1.5">
      <div style="font-family:var(--stamp-font);font-size:13px;color:var(--tan);letter-spacing:1px">${title}</div>
      <div style="font-size:11px;color:var(--paper-dark)">${mapName} · ${missionLabel} · ${t("modal.resume_turn", { turn: save.turn })}</div>
      <div style="font-size:10px;color:#556644">${savedDate}</div>
      ${missingMods.length ? `<div style="font-size:11px;color:#d9764a">${t("mods.save_missing", { mods: missingMods.join(", ") })}</div>` : ""}
      <div class="gen-bar hidden"><div class="gen-fill"></div></div>
    </div>
    <button class="btn" style="font-size:12px;padding:7px 16px;white-space:nowrap" ${missingMods.length ? "disabled" : ""}>${t("buttons.resume")}</button>
  `;

  // Sotto i pulsanti della lingua, sopra il titolo
  const stepMap = document.getElementById("modal-step-map");
  stepMap.insertBefore(banner, stepMap.querySelector("h2"));

  const btn = banner.querySelector("button");
  btn.addEventListener("click", async () => {
    // Barra di avanzamento nel banner (solo terreno procedurale)
    const bar = banner.querySelector(".gen-bar");
    btn.disabled = true;
    if (!save.mapData.image) bar.classList.remove("hidden");
    await resumeFromSave(key, (p) => {
      banner.querySelector(".gen-fill").style.width = `${Math.round(p * 100)}%`;
    });
  });
}

async function loadMissionStep(map) {
  document.getElementById("map-description").textContent = t("modal.loading");
  document.getElementById("map-description").classList.remove("load-error");
  document.getElementById("modal-start-btn").disabled = true;
  document.getElementById("mission-list").innerHTML = "";
  const regenBtn = document.getElementById("btn-regen-map");
  regenBtn.style.display = map.generator ? "" : "none";
  const sizePicker = document.getElementById("map-size-picker");
  sizePicker.style.display = map.generator ? "" : "none";

  const showDescription = (data) => {
    const dims = data.procedural ? ` (${data.cols}×${data.rows})` : "";
    document.getElementById("map-description").textContent =
      `${mt("name") ?? data.name ?? "?"}${dims} — ${mt("description") ?? data.description ?? ""}`;
  };

  // Dimensione delle mappe procedurali: ricordata tra una partita e l'altra
  let mapSize = "small";
  try {
    mapSize = localStorage.getItem(MAP_SIZE_KEY) || "small";
  } catch (e) {}
  if (!PROC_SIZES[mapSize]) mapSize = "small";
  // Generazione con barra di avanzamento: il grosso del tempo è il disegno
  // del terreno (render.js:prebuildTerrainCache), fatto a passi così la
  // pagina non si blocca; nel frattempo rigenera/dimensione/avvio sono spenti
  const genBar = document.getElementById("map-gen-bar");
  const genFill = document.getElementById("map-gen-fill");
  const startBtn = document.getElementById("modal-start-btn");
  let generating = false;
  const generate = async () => {
    generating = true;
    regenBtn.disabled = true;
    startBtn.disabled = true;
    sizePicker.querySelectorAll("[data-size]").forEach((b) => (b.disabled = true));
    const progress = (p) => {
      const pct = Math.round(p * 100);
      genFill.style.width = `${pct}%`;
      document.getElementById("map-description").textContent = t("modal.generating_map", { pct });
    };
    progress(0);
    genBar.classList.remove("hidden");
    try {
      await nextPaint();
      const data = generateProceduralMap(map.generator, undefined, mapSize);
      await prebuildTerrainCache(data, progress);
      return useMission(data);
    } finally {
      genBar.classList.add("hidden");
      regenBtn.disabled = false;
      startBtn.disabled = !document.querySelector(".mission-option.active");
      sizePicker.querySelectorAll("[data-size]").forEach((b) => (b.disabled = false));
      generating = false;
    }
  };
  const markSize = () =>
    sizePicker.querySelectorAll("[data-size]").forEach((b) =>
      b.classList.toggle("active", b.dataset.size === mapSize),
    );

  try {
    // Mappa procedurale: generata qui, poi salvata per intero con la partita
    const data = map.generator ? await generate() : await loadMission(map.file);
    showDescription(data);
    regenBtn.onclick = async () => {
      if (generating) return;
      sfx("click");
      showDescription(await generate());
    };
    markSize();
    sizePicker.querySelectorAll("[data-size]").forEach((b) => {
      b.onclick = async () => {
        if (generating || b.dataset.size === mapSize) return;
        mapSize = b.dataset.size;
        try {
          localStorage.setItem(MAP_SIZE_KEY, mapSize);
        } catch (e) {}
        markSize();
        sfx("click");
        showDescription(await generate());
      };
    });

    const list = document.getElementById("mission-list");
    list.innerHTML = "";
    let selected = null;

    (data.supportedMissions || []).forEach((mtype) => {
      const mt = MISSION_TYPES[mtype];
      const div = document.createElement("div");
      div.className = "mission-option";
      div.innerHTML = `<div class="mission-icon">${mt.icon}</div><div><div class="mname">${mt.label}</div><div class="mdesc">${mt.desc}</div></div>`;
      div.addEventListener("click", () => {
        document
          .querySelectorAll(".mission-option")
          .forEach((el) => el.classList.remove("active"));
        div.classList.add("active");
        selected = mtype;
        document.getElementById("modal-start-btn").disabled = false;
      });
      list.appendChild(div);
    });

    // Squad picker
    const squadClasses = ["assault", "sniper", "engineer", "medic"];
    const allClasses = Object.keys(UNIT_CLASSES);

    document.getElementById("squad-picker-label").textContent =
      t("modal.squad_title");

    const pickerEl = document.getElementById("squad-picker");
    pickerEl.innerHTML = "";

    const updateSlot = (slot, cls) => {
      const def = UNIT_CLASSES[cls];
      slot.innerHTML = `
        <div class="slot-badge" style="background:${def.color}">${def.symbol}</div>
        <div class="slot-name">${def.name}</div>
        <div class="slot-special">${def.specialLabel}</div>
      `;
    };

    for (let i = 0; i < 4; i++) {
      const slot = document.createElement("div");
      slot.className = "squad-slot";
      updateSlot(slot, squadClasses[i]);
      slot.addEventListener("click", () => {
        squadClasses[i] =
          allClasses[
            (allClasses.indexOf(squadClasses[i]) + 1) % allClasses.length
          ];
        updateSlot(slot, squadClasses[i]);
        sfx("click");
      });
      pickerEl.appendChild(slot);
    }

    // Missione notturna: scelta libera, oppure imposta dalla mappa ("night": true)
    const nightToggle = document.getElementById("night-toggle");
    nightToggle.checked = !!data.night;
    nightToggle.disabled = !!data.night;

    document.getElementById("modal-start-btn").onclick = async () => {
      if (!selected) return;
      document.getElementById("modal-start-btn").disabled = true;
      await ambientFadeOut(800);
      document.getElementById("modal-overlay").style.display = "none";
      startGame(selected, [...squadClasses], { night: nightToggle.checked });
    };
  } catch (err) {
    showLoadError(document.getElementById("map-description"), err);
  }
}

// Errore di caricamento di una mappa: l'elenco dei problemi se è una mappa
// non valida (validate.js:MapDataError), altrimenti il messaggio
function showLoadError(el, err) {
  if (err.issues) {
    el.textContent = issuesSummary(err);
    el.classList.add("load-error");
  } else {
    el.textContent = t("errors.map_load_failed", { message: err.message });
  }
}
