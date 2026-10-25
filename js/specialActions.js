async function handleSpecialAction(col, row) {
  const u = G.selectedUnit;
  if (!u) return;

  if (unitSpecial(u) === "heal") {
    const ally = G.reachable.find((t) => t.col === col && t.row === row);
    if (ally) {
      // Perk "heal" della campagna: HP curati in più
      const healed = Math.min(3 + perkSum(u, "heal"), ally.maxHp - ally.hp);
      ally.hp += healed;
      // Cure contate per l'esperienza del medico (campagna)
      if (healed > 0 || ally.bleeding) u.heals = (u.heals || 0) + 1;
      statAdd("medicHeal", healed);
      if (ally.bleeding) statAdd("bleedStopped");
      tutorialEvent("special", { cls: u.cls, kind: "heal", bleeding: !!ally.bleeding });
      if (ally.shaken && ally.hp / ally.maxHp >= SEVERE_WOUND_THRESHOLD) {
        ally.shaken = false;
        log(t("log.unit_recovered", { name: ally.name }), "success");
      }
      // Il medico ferma anche l'emorragia
      if (ally.bleeding) {
        ally.bleeding = false;
        log(t("log.bleeding_stopped", { name: u.name, target: ally.name }), "success");
      }
      u.ap -= 1;
      u.specialUsed = true;
      sfx("heal");
      addFX(
        "heal",
        {
          col: ally.col,
          row: ally.row,
          amount: healed,
          fromCol: u.col,
          fromRow: u.row,
        },
        1400,
      );
      log(
        t("log.medic_heal", {
          name: u.name,
          target: ally.name,
          healed,
          current: ally.hp,
          max: ally.maxHp,
        }),
        "success",
      );
      updateUI();
      render();
    }
    return;
  }

  if (unitSpecial(u) === "demolition") {
    const target = G.reachable.find((r) => r.col === col && r.row === row);
    if (!target) return;

    // Il geniere si gira verso il tile su cui lavora (disinnesco, tunnel,
    // incendio, demolizione)
    faceToward(u, target);
    if (G.fowEnabled) recomputeVisibility();

    // Trappola individuata: disinnesco (ha la precedenza su demolizione/incendio)
    const trap = trapAt(target.col, target.row);
    if (trap?.revealed) {
      disarmTrap(u, trap);
      return;
    }

    // Ingresso di tunnel individuato: lo sigilla (guerrilla.js)
    if (isKnownTunnel(target.col, target.row)) {
      sealTunnel(u, tunnelAt(target.col, target.row));
      return;
    }

    const tileType = getTileAt(target.col, target.row);

    // Burn tile burnable (non demolishable)
    if (tileType.burnable && !tileType.demolishable) {
      G.activeFires.push({
        col: target.col,
        row: target.row,
        turnsLeft: 2,
      });
      u.ap -= 1;
      u.specialUsed = true;
      sfx("demolition");
      addFX(
        "demolition",
        {
          col: target.col,
          row: target.row,
          success: true,
          ignite: true,
        },
        1100,
      );
      log(
        t("log.fire_set", {
          name: u.name,
          label: tileType.label,
        }),
        "success",
      );
      makeNoise(target, FIRE_NOISE);
      tutorialEvent("special", { cls: u.cls, kind: "burn" });
      _startTileAnimLoop();
      updateUI();
      render();
      return;
    }

    // Demolition on a demolishable tile
    log(t("log.demolition_start", { name: u.name }), "system");
    const dice = rollDice(1);//await waitForDice(1, "Demolizione");
    const demolished = diceSum(dice) >= 4;
    if (demolished) {
      G.mapData.grid[target.row][target.col] = tileType.demolishResult || "J";
      invalidateTerrainTile(target.col, target.row);
      u.ap -= 1;
      u.specialUsed = true;
      sfx("demolition");
      addFX(
        "demolition",
        {
          col: target.col,
          row: target.row,
          success: true,
        },
        1500,
      );
      log(
        t("log.demolition_success", {
          label: tileType.label,
        }),
        "success",
      );
    } else {
      sfx("demolition");
      addFX(
        "demolition",
        {
          col: target.col,
          row: target.row,
          success: false,
        },
        1100,
      );
      log(
        t("log.demolition_fail", {
          label: tileType.label,
        }),
        "combat",
      );
      u.ap -= 1;
      u.specialUsed = true;
    }
    // La carica esplode comunque, anche se il muro regge
    makeNoise(target, DEMOLITION_NOISE);
    tutorialEvent("special", {
      cls: u.cls,
      kind: "demolish",
      col: target.col,
      row: target.row,
      success: demolished,
    });
    updateUI();
    render();
  }
}

async function confirmAoeAttack() {
  if (!G.pendingAoe || !G.selectedUnit || G.throwing) return;
  const u = G.selectedUnit;
  const { col: tc, row: tr, weapon: w, line } = G.pendingAoe;
  clearLastMove();
  u.ap -= 1;
  consumeShot(w);
  tutorialEvent("aoe", { cls: u.cls, weapon: w.id });
  setActionMode(null);
  updateUI();
  // Napalm: attacco aereo sulla linea scelta, al prossimo turno (mechanics.js)
  if (w.napalm) return scheduleNapalm(u, w, line);
  // Granate: deviazione e volo animato prima dell'esplosione (combat.js)
  await throwAoe(u, w, tc, tr);
}
