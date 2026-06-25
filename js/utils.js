const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
