function rollD6() {
  return rnd(1, 6);
}
function rollDice(n) {
  return Array.from({ length: n }, rollD6);
}
function diceSum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
function waitForDice(count, context) {
  return new Promise((resolve) => {
    G.pendingDice = { count, context, resolve };
    updateDiceBtn(true);
    document.getElementById("dice-result").textContent = t("log.dice_prompt", {
      context,
      count,
    });
  });
}

function updateDiceBtn(active) {
  const btn = document.getElementById("btn-dice");
  btn.disabled = !active && G.pendingDice === null;
  btn.style.boxShadow = active ? "0 0 8px var(--yellow)" : "";
}

const origWaitForDice = waitForDice;
waitForDice = function (count, context) {
  if (isMobile()) {
    if (document.body.classList.contains("sheet-collapsed")) expandSheet();
    switchTab("dice");
    // Badge pulsa
    const tabDice = document.getElementById("tab-btn-dice");
    if (tabDice) tabDice.classList.add("needs-dice");
  }
  return origWaitForDice(count, context);
};

// Dopo che il dado viene lanciato, rimuovi badge
const origBtnDice = document.getElementById("btn-dice");
origBtnDice.addEventListener("click", () => {
  const tabDice = document.getElementById("tab-btn-dice");
  if (tabDice) tabDice.classList.remove("needs-dice");
});

function showDiceResult(vals, context) {
  showDiceResultMobile(vals, context);
}

function showDiceResultMobile(vals, context) {
  ["dice-display", "mob-dice-display"].forEach((id) => {
    const el = document.getElementById(id);
    el.innerHTML = "";
    vals.forEach((v) => {
      const d = document.createElement("div");
      d.className = "die";
      // Su mobile i dadi sono leggermente più grandi
      if (id.startsWith("mob"))
        d.style.cssText = "width:44px;height:44px;font-size:24px";
      d.textContent = v;
      el.appendChild(d);
    });
  });
  ["dice-result", "mob-dice-result"].forEach((id) => {
    document.getElementById(id).textContent = t("log.dice_result", {
      context,
      dice: vals.join("+"),
      sum: diceSum(vals),
    });
  });
}

document.getElementById("btn-dice").addEventListener("click", () => {
  if (!G.pendingDice) {
    // Dado libero: lancia 1d6 per info
    const val = rollDice(1);
    showDiceResult(val, "Dado libero");
    return;
  }
  const { count, context, resolve } = G.pendingDice;
  G.pendingDice = null;
  const vals = rollDice(count);
  showDiceResult(vals, context);
  updateDiceBtn(false);
  resolve(vals);
});
