function initModal() {
  document.getElementById("modal-overlay").style.display = "flex";
  document.getElementById("modal-step-map").style.display = "";
  document.getElementById("modal-step-mission").style.display = "none";
  document.getElementById("btn-select-map").disabled = true;
  document.getElementById("btn-menu").style.display = "none";

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
        await ambientFadeOut(800);
        resumeGame(s);
      });
  }

  const grid = document.getElementById("map-select-grid");
  grid.innerHTML = "";
  let selectedMapFile = null;

  // Map cards
  MAPS.forEach((m) => {
    const card = document.createElement("div");
    card.className = "map-card";
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
      selectedMapFile = m.file;
      document.getElementById("btn-select-map").disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById("btn-select-map").onclick = async () => {
    if (!selectedMapFile) return;
    document.getElementById("modal-step-map").style.display = "none";
    document.getElementById("modal-step-mission").style.display = "block";
    await loadMissionStep(selectedMapFile);
  };

  document.getElementById("btn-back-map").onclick = () => {
    document.getElementById("modal-step-map").style.display = "";
    document.getElementById("modal-step-mission").style.display = "none";
    document.getElementById("btn-select-map").disabled = true;
    document
      .querySelectorAll(".map-card")
      .forEach((el) => el.classList.remove("active"));
    selectedMapFile = null;
  };
}

async function loadMissionStep(jsonPath) {
  document.getElementById("map-description").textContent = t("modal.loading");
  document.getElementById("modal-start-btn").disabled = true;
  document.getElementById("mission-list").innerHTML = "";

  try {
    const data = await loadMission(jsonPath);
    document.getElementById("map-description").textContent =
      `${data.name[LANG]} — ${data.description[LANG] || ""}`;

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

    document.getElementById("modal-start-btn").onclick = async () => {
      if (!selected) return;
      document.getElementById("modal-start-btn").disabled = true;
      await ambientFadeOut(800);
      document.getElementById("modal-overlay").style.display = "none";
      startGame(selected, [...squadClasses]);
    };
  } catch (err) {
    document.getElementById("map-description").textContent = t(
      "errors.map_load_failed",
      { message: err.message },
    );
  }
}
