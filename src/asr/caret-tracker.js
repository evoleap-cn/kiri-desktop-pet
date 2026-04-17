/**
 * Caret position tracker - placeholder (ffi implementation pending)
 */

/**
 * Get current caret position - not implemented
 * @returns {null}
 */
function getCaretPosition() {
  return null;
}

/**
 * Start tracking - not implemented
 */
function startTracking(intervalMs = 100, callback) {
  // No-op
}

/**
 * Stop tracking - not implemented
 */
function stopTracking() {
  // No-op
}

/**
 * Get last known position - not implemented
 */
function getCurrentPosition() {
  return null;
}

module.exports = {
  getCaretPosition,
  startTracking,
  stopTracking,
  getCurrentPosition
};
