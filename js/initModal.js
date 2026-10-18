function initModal() {
  document.getElementById("modal-overlay").style.display = "flex";
  document.getElementById("modal-step-map").style.display = "";
  document.getElementById("modal-step-mission").style.display = "none";
  document.getElementById("btn-select-map").disabled = true;
  document.getElementById("btn-menu").style.display = "none";
  document.getElementById("tutorial-overlay").classList.add("hidden");
  document.getElementById("tutorial-panel").classList.add("hidden");

  // "Resume game" banner if a savegame exists
  const existingBanner = document.getElementById("resume-banner");
  if (existingBanner) existingBanner.remove();

  const save = loadSave();
  if (save) {
    const savedDate = new Date(save.savedAt).toLocaleString();

    const missionLabel =
      MISSION_TYPES[save.missionType]?.label || save.missionType;

    const banner = document.createElement("div");
    banner.id = "resume-banner";
    banner.style.cssText =
      "background:#1a2a12;border:1px solid #5a8a30;border-radius:3px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;";
    banner.innerHTML = `
      <div style="text-align:left;line-height:1.5">
        <div style="font-family:var(--stamp-font);font-size:13px;color:var(--tan);letter-spacing:1px">${t("modal.resume_title")}</div>
        <div style="font-size:11px;color:var(--paper-dark)">${save.mapName} · ${missionLabel} · ${t("modal.resume_turn", { turn: save.turn })}</div>
        <div style="font-size:10px;color:#556644">${savedDate}</div>
        <div class="gen-bar hidden" id="resume-gen-bar"><div class="gen-fill" id="resume-gen-fill"></div></div>
      </div>
      <button class="btn" id="btn-resume" style="font-size:12px;padding:7px 16px;white-space:nowrap">${t("buttons.resume")}</button>
    `;

    document
      .getElementById("modal-step-map")
      .insertBefore(
        banner,
        document.getElementById("modal-step-map").firstChild,
      );

    document
      .getElementById("btn-resume")
      .addEventListener("click", async () => {
        const s = loadSave();
        if (!s) return;
        // Terreno procedurale disegnato a passi (render.js:prebuildTerrainCache)
        // mentre la musica sfuma, con la barra nel banner
        const btn = document.getElementById("btn-resume");
        const bar = document.getElementById("resume-gen-bar");
        btn.disabled = true;
        if (!s.mapData.image) bar.classList.remove("hidden");
        await Promise.all([
          ambientFadeOut(800),
          prebuildTerrainCache(s.mapData, (p) => {
            document.getElementById("resume-gen-fill").style.width = `${Math.round(p * 100)}%`;
          }),
        ]);
        resumeGame(s);
      });
  }

  const grid = document.getElementById("map-select-grid");
  grid.innerHTML = "";
  let selectedMap = null;

  // Map cards
  MAPS.forEach((m) => {
    const card = document.createElement("div");
    card.className = m.tutorial ? "map-card tutorial-card" : "map-card";
    if (m.tutorial) {
      // Addestramento: apre direttamente l'elenco delle lezioni
      card.innerHTML = `
        <div class="map-icon">${m.icon}</div>
        <div class="map-name">${m.label}</div>
        <div class="map-sub">${m.subtitle}</div>`;
      card.addEventListener("click", () => {
        sfx("click");
        openTutorialModal();
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
}

async function loadMissionStep(map) {
  document.getElementById("map-description").textContent = t("modal.loading");
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
    document.getElementById("map-description").textContent = t(
      "errors.map_load_failed",
      { message: err.message },
    );
  }
}
