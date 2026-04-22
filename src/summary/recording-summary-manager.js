/**
 * Recording Summary Manager
 * 
 * Handles the recording summary feature business logic:
 * - Audio recording
 * - Summary generation (future extension)
 * - State transitions via stateManager
 * 
 * Usage:
 *   const manager = createRecordingSummaryManager({ getWin, windowManager, stateManager });
 *   manager.startRecording();  // Transitions to recording_summary state
 *   manager.stopRecording();   // Transitions back to idle state
 */

function createRecordingSummaryManager({ getWin, windowManager, stateManager }) {
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;

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
  async function startRecording() {
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

    try {
      // Request microphone access
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize MediaRecorder
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('[RecordingSummary] Recording stopped, audio chunks collected:', audioChunks.length);
        // TODO: Send audio to backend for summary generation
        audioChunks = [];
      };

      // Start recording
      mediaRecorder.start();
      isRecording = true;

      console.log('[RecordingSummary] Recording started');
      notifyRenderer('summary:recording-started');
      return true;

    } catch (err) {
      console.error('[RecordingSummary] Failed to start recording:', err.message);
      // Rollback state transition
      stateManager.transition('idle');
      notifyRenderer('summary:error', err.message);
      return false;
    }
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
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }

      // Stop all audio tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }

      isRecording = false;
      console.log('[RecordingSummary] Recording stopped');

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