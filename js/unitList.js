function makeUnitCard(u, mobile) {
  const def = UNIT_CLASSES[u.cls];
  const sel = G.selectedUnit && G.selectedUnit.id === u.id;
  const dead = !u.alive;
  const done = u.alive && u.ap <= 0;
  const hpPct = ((u.hp / u.maxHp) * 100).toFixed(0);
  const hpCol = u.hp / u.maxHp > 0.5 ? "var(--hp-full)" : "var(--hp-low)";

  const card = document.createElement("div");

  if (mobile) {
    // Card orizzontale compatta per mobile
    card.className =
      "unit-card" +
      (sel ? " selected" : "") +
      (dead ? " dead" : done ? " done" : "");
    if (dead) card.style.opacity = "0.35";
    card.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(58,90,26,0.4);cursor:pointer";
    card.innerHTML = `
      <div style="width:38px;height:38px;border-radius:4px;background:${dead ? "#334" : def.color};
        display:flex;align-items:center;justify-content:center;
        font-family:var(--ui-font);font-size:20px;font-weight:700;color:#fff;flex-shrink:0;
        opacity:${dead ? 0.4 : done ? 0.6 : 1}">
        ${def.symbol}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--ui-font);font-size:13px;font-weight:600;
          color:${dead ? "#556644" : def.color};display:flex;align-items:center;gap:5px">
          ${u.name}
          ${dead ? `<span style="font-size:9px;background:#441111;color:#ff6666;padding:1px 4px;border-radius:2px">KIA</span>` : ""}
          ${u.overwatch ? '<span style="font-size:9px;color:#aaddff">OW</span>' : ""}
          ${u.suppression ? '<span style="font-size:9px;color:#ffaa33">SUP</span>' : ""}
          ${u.shaken ? '<span style="font-size:9px;background:#661100;color:#ff5028;padding:1px 4px;border-radius:2px">SCO</span>' : ""}
          ${u.carriesPilot ? '<span style="font-size:11px">✈</span>' : ""}
        </div>
        <div style="font-size:10px;color:var(--paper-dark);display:flex;gap:8px;margin-top:1px">
          <span>HP ${u.hp}/${u.maxHp}</span>
          <span>AP ${u.ap}/${AP_PER_TURN}</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:4px">
          <div style="height:100%;width:${hpPct}%;background:${hpCol};border-radius:2px"></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;flex-shrink:0">
        ${Array.from(
          { length: AP_PER_TURN },
          (_, i) => `
          <div style="width:8px;height:8px;border-radius:50%;
            background:${i < u.ap ? "var(--tan)" : "var(--green-light)"};
            opacity:${i < u.ap ? 1 : 0.3}"></div>`,
        ).join("")}
      </div>
    `;
  } else {
    // Card verticale desktop originale
    card.className =
      "unit-card" +
      (sel ? " selected" : "") +
      (dead ? " dead" : done ? " done" : "");
    if (dead) card.style.opacity = "0.35";
    card.innerHTML = `
      <div class="uname" style="color:${dead ? "#556644" : def.color}">
        <span>${u.name}</span>
        <span class="class-tag">${def.symbol}</span>
        ${dead ? `<span class="class-tag" style="background:#441111;color:#ff6666">KIA</span>` : ""}
        ${u.shaken && !dead ? `<span class="class-tag" style="background:#661100;color:#ff5028">SCO</span>` : ""}
      </div>
      <div class="ustat">
        <span>HP ${u.hp}/${u.maxHp}</span>
        <span>AP ${u.ap}/${AP_PER_TURN}</span>
        <span>(${u.col},${u.row})</span>
      </div>
      <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%;background:${hpCol}"></div></div>
      <div class="ap-pips">${Array.from(
        { length: AP_PER_TURN },
        (_, i) => `
        <div class="ap-pip${i < u.ap ? " used" : ""}"></div>`,
      ).join("")}</div>
    `;
  }

  if (u.alive)
    card.addEventListener("click", () => {
      G.selectedUnit = u;
      G.actionMode = null;
      updateUI();
      render();
      // Su mobile: salta al tab azioni dopo selezione
      if (isMobile()) switchTab("actions");
    });
  return card;
}

function updateUnitList() {
  // Desktop
  const el = document.getElementById("unit-list");
  el.innerHTML = "";
  G.units.forEach((u) => el.appendChild(makeUnitCard(u, false)));

  // Mobile
  const mel = document.getElementById("mob-unit-list");
  mel.innerHTML = "";
  G.units.forEach((u) => mel.appendChild(makeUnitCard(u, true)));
}
