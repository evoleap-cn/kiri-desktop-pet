/**
 * Global Application State Manager
 * 
 * Manages the state machine for the desktop pet application.
 * Enforces state transition rules and publishes state change events.
 * 
 * State Machine:
 *   idle <-> voice_input (triggered by hotkey F9)
 *   idle <-> recording_summary (triggered by menu button)
 *   voice_input ❌-> recording_summary (forbidden)
 *   recording_summary ❌-> voice_input (forbidden)
 */

const STATES = {
  IDLE: 'idle',
  VOICE_INPUT: 'voice_input',
  RECORDING_SUMMARY: 'recording_summary'
};

// State transition rules: which states can transition to which
const ALLOWED_TRANSITIONS = {
  [STATES.IDLE]: [STATES.VOICE_INPUT, STATES.RECORDING_SUMMARY],
  [STATES.VOICE_INPUT]: [STATES.IDLE],
  [STATES.RECORDING_SUMMARY]: [STATES.IDLE]
};

function createAppStateManage() {
  let currentState = STATES.IDLE;
  const listeners = [];

  function notifyListeners(oldState, newState) {
    listeners.forEach(callback => {
      try {
        callback(newState, oldState);
      } catch (err) {
        console.error('[AppState] Error in state change listener:', err.message);
      }
    });
  }

  function getCurrentState() {
    return currentState;
  }

  function canTransition(targetState) {
    const allowedTargets = ALLOWED_TRANSITIONS[currentState];
    return allowedTargets && allowedTargets.includes(targetState);
  }

  function transition(targetState) {
    if (!Object.values(STATES).includes(targetState)) {
      console.error(`[AppState] Invalid state: ${targetState}`);
      return false;
    }

    if (!canTransition(targetState)) {
      console.warn(`[AppState] Invalid transition from '${currentState}' to '${targetState}'`);
      return false;
    }

    const oldState = currentState;
    currentState = targetState;
    console.log(`[AppState] State changed: ${oldState} → ${targetState}`);
    notifyListeners(oldState, targetState);
    return true;
  }

  function isIdle() {
    return currentState === STATES.IDLE;
  }

  function isVoiceInput() {
    return currentState === STATES.VOICE_INPUT;
  }

  function isRecordingSummary() {
    return currentState === STATES.RECORDING_SUMMARY;
  }

  function onChange(callback) {
    listeners.push(callback);
    return () => offChange(callback);
  }

  function offChange(callback) {
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  return {
    STATES,
    getCurrentState,
    canTransition,
    transition,
    isIdle,
    isVoiceInput,
    isRecordingSummary,
    onChange,
    offChange
  };
}

module.exports = { createAppStateManage, STATES };