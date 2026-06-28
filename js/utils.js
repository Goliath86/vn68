/**
 * Generate a random integer between two bounds
 * @param {number} min Lower bound
 * @param {number} max Upper bound
 * @returns {number} Random integer
 */
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Clamp a value between two bounds
 * @param {number} v Value to clamp
 * @param {number} a Lower bound
 * @param {number} b Upper bound
 * @returns {number} Clamped value
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Calculate the Manhattan distance between two points
 * @param {object} a First point
 * @param {object} b Second point
 * @returns {number} Manhattan distance
 */
const dist = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

/**
 * Pick a random element from an array
 * @param {array} arr Array to pick from
 * @returns {any} Random element from the array
 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Pause execution for a specified number of milliseconds
 * @param {number} ms Number of milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Check if the current device is a mobile device */
function isMobile() {
  return (
    window.innerWidth <= 700 ||
    window.matchMedia("(orientation:landscape) and (max-height:450px)").matches
  );
}
