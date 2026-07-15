/**
 * Emulate a roll of a D6
 * @returns {number} A random number between 1 and 6
 */
function rollD6() {
  return rnd(1, 6);
}

/**
 * Roll a number of dice
 * @param {number} n The number of dice to roll
 * @returns {number[]} An array of dice rolls
 */
function rollDice(n) {
  return Array.from({ length: n }, rollD6);
}

/**
 * Sum the rolls of a dice array
 * @param {number[]} arr The array of dice rolls
 * @returns {number} The sum of the dice rolls
 */
function diceSum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
