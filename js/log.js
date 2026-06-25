function log(msg, type) {
  // Desktop
  const el = document.getElementById("log-list");
  const div = document.createElement("div");
  div.className = "log-entry" + (type ? " " + type : "");
  const ts = document.createElement("span");
  ts.className = "log-ts";
  ts.textContent = `T${G.turn}`;
  div.appendChild(ts);
  div.appendChild(document.createTextNode(msg));
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;

  // Mobile — clona il nodo
  const mel = document.getElementById("mob-log-list");
  const mDiv = div.cloneNode(true);
  mel.appendChild(mDiv);
  mel.scrollTop = mel.scrollHeight;

  // Badge log: se non è attivo il tab log, lampeggia l'icona (solo combat/enemy/success)
  if (
    isMobile() &&
    (type === "combat" || type === "enemy" || type === "success")
  ) {
    const tabLog = document.querySelector('.tab-btn[data-tab="log"]');
    if (tabLog && !tabLog.classList.contains("active")) {
      tabLog.style.color = "var(--highlight)";
      setTimeout(() => {
        tabLog.style.color = "";
      }, 800);
    }
  }
}
