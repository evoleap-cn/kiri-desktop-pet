/**
 * Caret position tracker - Windows implementation using native C extension
 *
 * Uses GetGUIThreadInfo WinAPI to get caret position from the foreground window.
 * Falls back to null for non-Windows platforms or when native module is unavailable.
 */

const os = require('os');
const path = require('path');
const build = require('node-gyp-build');

// Try to load native caret position module
let nativeModule = null;
try {
  if (os.platform() === 'win32') {
    console.log('[CaretTracker] Trying to load native caret tracker...');
    nativeModule = build(path.join(__dirname, '..', '..'));
    console.log('[CaretTracker] Native caret tracker loaded successfully');
  }
} catch (err) {
  console.warn('[CaretTracker] Native module not available:', err.message);
}

let trackingInterval = null;
let lastKnownPosition = null;
let trackingCallback = null;

let lastLogState = null; // Track last logged state to suppress duplicates

/**
 * Get current caret position using native C extension
 * @returns {Object|null} - {x, y, width, height} or null
 */
function getCaretPosition() {
  if (!nativeModule) {
    return null;
  }

  try {
    const position = nativeModule.getCaretPosition();
    // Only log when state changes (null <-> has value)
    const hasPosition = position !== null;
    if (hasPosition !== lastLogState) {
      lastLogState = hasPosition;
      if (hasPosition) {
        console.log('[CaretTracker] Got position:', JSON.stringify(position));
      } else {
        console.log('[CaretTracker] No caret position found');
      }
    }
    if (hasPosition) {
      lastKnownPosition = position;
    }
    return position;
  } catch (err) {
    console.warn('[CaretTracker] Failed to get caret position:', err.message);
    return null;
  }
}

/**
 * Start tracking caret position at specified interval
 * @param {number} intervalMs - Polling interval in milliseconds (default: 100)
 * @param {function} callback - Called with {x, y, width, height} on each poll
 */
function startTracking(intervalMs = 100, callback) {
  if (trackingInterval) {
    stopTracking();
  }

  trackingCallback = callback;

  trackingInterval = setInterval(() => {
    const position = getCaretPosition();
    if (position && trackingCallback) {
      trackingCallback(position);
    }
  }, intervalMs);

  console.log(`[CaretTracker] Started tracking at ${intervalMs}ms interval`);
}

/**
 * Stop tracking caret position
 */
function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
    trackingCallback = null;
    console.log('[CaretTracker] Stopped tracking');
  }
}

/**
 * Get last known caret position
 * @returns {Object|null}
 */
function getCurrentPosition() {
  return lastKnownPosition;
}

module.exports = {
  getCaretPosition,
  startTracking,
  stopTracking,
  getCurrentPosition
};
