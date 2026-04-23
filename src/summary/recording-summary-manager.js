/**
 * Recording Summary Manager
 * 
 * Handles the recording summary feature business logic:
 * - State transitions via stateManager
 * - IPC notifications to renderer process
 * 
 * Note: Actual audio recording should be handled by renderer process
 * using browser APIs (MediaRecorder, getUserMedia).
 * This manager focuses on state coordination and business logic.
 * 
 * Usage:
 *   const manager = createRecordingSummaryManager({ getWin, windowManager, stateManager });
 *   manager.startRecording();  // Transitions to recording_summary state
 *   manager.stopRecording();   // Transitions back to idle state
 */

function createRecordingSummaryManager({ getWin, windowManager, stateManager }) {
  let isRecording = false;

  function notifyRenderer(channel, ...args) {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }

  /**
   * Start recording for summary generation
   * Requests state transition from idle -> recording_summary
   * @returns {boolean} Success status
   */
  function startRecording() {
    if (isRecording) {
      console.log('[RecordingSummary] Already recording, ignoring start request');
      return false;
    }

    // Request state transition
    const success = stateManager.transition('recording_summary');
    if (!success) {
      console.warn('[RecordingSummary] State transition failed');
      return false;
    }

    // TODO: Implement actual recording logic in renderer process
    // For now, this is a placeholder to verify state machine works
    isRecording = true;

    console.log('[RecordingSummary] Recording started (placeholder - real recording TBD)');
    notifyRenderer('summary:recording-started');
    return true;
  }

  /**
   * Stop recording and generate summary
   * Requests state transition from recording_summary -> idle
   */
  function stopRecording() {
    if (!isRecording) {
      console.log('[RecordingSummary] Not recording, ignoring stop request');
      return;
    }

    try {
      isRecording = false;
      console.log('[RecordingSummary] Recording stopped (placeholder - real recording TBD)');

      // TODO: Send collected audio to backend for summary generation
      
      // Request state transition back to idle
      stateManager.transition('idle');
      notifyRenderer('summary:recording-stopped');

    } catch (err) {
      console.error('[RecordingSummary] Error stopping recording:', err.message);
      isRecording = false;
      stateManager.transition('idle');
      notifyRenderer('summary:error', err.message);
    }
  }

  /**
   * Toggle recording state
   */
  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  /**
   * Check if currently recording
   */
  function isCurrentlyRecording() {
    return isRecording;
  }

  return {
    startRecording,
    stopRecording,
    toggleRecording,
    isCurrentlyRecording
  };
}

module.exports = { createRecordingSummaryManager };