const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMobile() {
  return (
    window.innerWidth <= 700 ||
    window.matchMedia("(orientation:landscape) and (max-height:450px)").matches
  );
}
