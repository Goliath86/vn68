async function handleSpecialAction(col, row) {
  const u = G.selectedUnit;
  if (!u) return;

  if (u.cls === "medic") {
    const ally = G.reachable.find((t) => t.col === col && t.row === row);
    if (ally) {
      const healed = Math.min(3, ally.maxHp - ally.hp);
      ally.hp += healed;
      if (ally.shaken && ally.hp / ally.maxHp >= 0.3) {
        ally.shaken = false;
        log(t("log.unit_recovered", { name: ally.name }), "success");
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

  if (u.cls === "engineer") {
    const target = G.reachable.find((r) => r.col === col && r.row === row);
    if (!target) return;

    // Trappola individuata: disinnesco (ha la precedenza su demolizione/incendio)
    const trap = trapAt(target.col, target.row);
    if (trap?.revealed) {
      disarmTrap(u, trap);
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
      _startTileAnimLoop();
      updateUI();
      render();
      return;
    }

    // Demolition on a demolishable tile
    log(t("log.demolition_start", { name: u.name }), "system");
    const dice = rollDice(1);//await waitForDice(1, "Demolizione");
    if (diceSum(dice) >= 4) {
      G.mapData.grid[target.row][target.col] = tileType.demolishResult || "J";
      invalidateTerrainCache();
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
    updateUI();
    render();
  }
}

function confirmAoeAttack() {
  if (!G.pendingAoe || !G.selectedUnit) return;
  const u = G.selectedUnit;
  const { col: tc, row: tr, weapon: w } = G.pendingAoe;
  clearLastMove();
  u.ap -= 1;
  if (w.ammo !== null) w.ammo--;
  if (u.cls === "sniper") u.hasShot = true;
  resolveAoeCombat(u, w, tc, tr, false);
  setActionMode(null);
  updateUI();
}
