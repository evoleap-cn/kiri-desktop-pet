const WebSocket = require("ws");
const { globalShortcut } = require("electron");

const ASR_CONFIG = {
  serverUrl: process.env.ASR_SERVER_URL || "ws://192.168.1.66:8000/ws/v1/asr",
  hotkey: "F9",
  sampleRate: 16000,
  heartbeatInterval: 30000,
  reconnectDelay: 3000,
};

const MAX_RECONNECT_ATTEMPTS = 10;

function createAsrManager({ getWin, windowManager, injectText, caretTracker, stateManager }) {
  let asrWs = null;
  let isRecording = false;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let audioBufferQueue = [];
  let accumulatedAsrText = "";
  let pendingText = "";
  let asrFinalResultReceived = false;
  let closeResolve = null;

  function notifyRenderer(channel, ...args) {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────────

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (asrWs && asrWs.readyState === WebSocket.OPEN) {
        asrWs.ping();
      }
    }, ASR_CONFIG.heartbeatInterval);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ─── Connection ──────────────────────────────────────────────────────────────

  function finalizeClose() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    audioBufferQueue = [];
    if (asrWs) {
      asrWs.close();
      asrWs = null;
    }
    if (closeResolve) {
      closeResolve();
      closeResolve = null;
    }
  }

  function initAsrConnection() {
    if (asrWs && (asrWs.readyState === WebSocket.CONNECTING || asrWs.readyState === WebSocket.OPEN)) {
      console.log("[ASR] Connection already exists");
      return;
    }

    console.log(`[ASR] Connecting to ${ASR_CONFIG.serverUrl}...`);
    asrWs = new WebSocket(ASR_CONFIG.serverUrl);

    asrWs.on("open", () => {
      console.log("[ASR] WebSocket connected");
      reconnectAttempts = 0;

      const startMsg = {
        header: {
          namespace: "SpeechTranscriber",
          name: "StartTranscription",
          appkey: process.env.ASR_APPKEY || "default",
        },
        payload: {
          format: "pcm",
          sample_rate: ASR_CONFIG.sampleRate,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
        },
      };
      asrWs.send(JSON.stringify(startMsg));

      if (audioBufferQueue.length > 0) {
        console.log(`[ASR] Sending ${audioBufferQueue.length} buffered audio chunks`);
        for (const chunk of audioBufferQueue) {
          asrWs.send(chunk, { binary: true });
        }
        audioBufferQueue = [];
      }

      startHeartbeat();
      notifyRenderer("asr:connected");
    });

    asrWs.on("message", (data) => {
      try {
        const msg = JSON.parse(typeof data === "string" ? data : data.toString("utf8"));
        const name = msg.header?.name;

        if (name === "TranscriptionStarted") {
          console.log("[ASR] Transcription started successfully");
          accumulatedAsrText = "";
          pendingText = "";
          notifyRenderer("asr:recording-started");

        } else if (name === "SentenceBegin") {
          if (pendingText && pendingText.trim()) {
            console.log(`[ASR] SentenceBegin - injecting previous segment: "${pendingText}"`);
            injectText(pendingText)
              .then(() => console.log("[ASR] Previous segment injected successfully"))
              .catch(err => console.error("[ASR] Failed to inject previous segment:", err.message));
            accumulatedAsrText += " ";
          }
          pendingText = "";
          console.log("[ASR] Sentence begin detected");
          notifyRenderer("asr:sentence-begin");

        } else if (name === "TranscriptionResultChanged") {
          const text = msg.payload?.result || "";
          if (text) {
            pendingText = text;
            const fullText = accumulatedAsrText + text;
            windowManager.updateOverlayText(fullText);
            windowManager.updateAsrText(fullText);
            windowManager.positionOverlayAtCaret();
            notifyRenderer("asr:partial-result", fullText);
          }

        } else if (name === "SentenceEnd") {
          const serverText = msg.payload?.result || "";
          console.log(`[ASR] SentenceEnd received, server result: "${serverText}"`);
          const textToInject = serverText || pendingText;
          if (textToInject && textToInject.trim()) {
            console.log(`[ASR] SentenceEnd - injecting: "${textToInject}"`);
            injectText(textToInject)
              .then(() => {
                console.log("[ASR] SentenceEnd text injected successfully");
                windowManager.flashAsrTextInjected();
                notifyRenderer("asr:text-injected");
              })
              .catch(err => console.error("[ASR] Failed to inject SentenceEnd text:", err.message));
            accumulatedAsrText += (accumulatedAsrText ? " " : "") + textToInject;
            pendingText = "";
          }
          windowManager.hideOverlayWindow();
          accumulatedAsrText = "";
          pendingText = "";

        } else if (name === "TranscriptionCompleted") {
          const text = msg.payload?.result || "";
          console.log(`[ASR] TranscriptionCompleted received: "${text}"`);
          asrFinalResultReceived = true;
          const finalText = (accumulatedAsrText + " " + (text || pendingText)).trim();
          if (finalText && finalText !== accumulatedAsrText.trim()) {
            console.log(`[ASR] Injecting final text: "${finalText}"`);
            injectText(finalText)
              .then(() => console.log("[ASR] Final text injected successfully"))
              .catch(err => console.error("[ASR] Failed to inject final text:", err.message));
          }
          notifyRenderer("asr:final-result", text);
          if (closeResolve) {
            console.log("[ASR] Final result received, closing connection");
            finalizeClose();
          }

        } else if (name === "TaskFailed") {
          const errorMsg = msg.payload?.status_text || "ASR task failed";
          console.error("[ASR] Task failed:", errorMsg);
          notifyRenderer("asr:error", errorMsg);

        } else {
          console.log(`[ASR] Unhandled message type: ${name || "unknown"}`, JSON.stringify(msg, null, 2));
        }
      } catch (e) {
        console.error(`[ASR] Message parse error: ${e.message}`);
      }
    });

    asrWs.on("error", (error) => {
      console.error("[ASR] WebSocket error:", error.message);
      notifyRenderer("asr:error", error.message);
      if (reconnectAttempts === 0) {
        notifyRenderer("asr:status", "连接质量差，正在尝试重连...");
      }
    });

    asrWs.on("close", (code, reason) => {
      console.log(`[ASR] WebSocket closed: code=${code}, reason=${reason}`);
      stopHeartbeat();
      notifyRenderer("asr:disconnected");

      if (isRecording && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[ASR] Reconnecting... attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        notifyRenderer("asr:status", `正在重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnectTimer = setTimeout(() => {
          initAsrConnection();
        }, ASR_CONFIG.reconnectDelay);
      }
    });
  }

  function closeAsrConnection() {
    return new Promise((resolve) => {
      if (!asrWs) {
        resolve();
        return;
      }

      stopHeartbeat();
      closeResolve = resolve;
      asrFinalResultReceived = false;

      if (asrWs.readyState === WebSocket.OPEN) {
        const stopMsg = {
          header: { namespace: "SpeechTranscriber", name: "StopTranscription" },
        };
        asrWs.send(JSON.stringify(stopMsg));
        console.log("[ASR] StopTranscription sent, waiting for final result...");
        setTimeout(() => {
          if (!asrFinalResultReceived) {
            console.log("[ASR] Timeout waiting for final result, closing connection");
          }
          finalizeClose();
        }, 2000);
      } else {
        finalizeClose();
      }
    });
  }

  function sendAudioChunk(buffer) {
    if (asrWs && asrWs.readyState === WebSocket.OPEN) {
      const bufferToSend = Buffer.from(new Uint8Array(buffer.buffer));
      asrWs.send(bufferToSend, { binary: true });
    } else if (asrWs && asrWs.readyState === WebSocket.CONNECTING) {
      const bufferToQueue = Buffer.from(new Uint8Array(buffer.buffer));
      audioBufferQueue.push(bufferToQueue);
      console.log(`[ASR] Queuing audio chunk, queue size: ${audioBufferQueue.length}`);
    }
  }

  // ─── Hotkey ──────────────────────────────────────────────────────────────────

  function registerHotkey() {
    const ret = globalShortcut.register(ASR_CONFIG.hotkey, () => {
      console.log(`[ASR] Hotkey ${ASR_CONFIG.hotkey} pressed`);
      
      // Check if recording summary is active - forbid transition
      if (stateManager && stateManager.isRecordingSummary()) {
        console.log('[ASR] Cannot start: recording summary is active');
        notifyRenderer('asr:error', '请先关闭录音纪要');
        return;
      }

      isRecording = !isRecording;

      if (isRecording) {
        // Request state transition to voice_input
        if (stateManager) {
          const success = stateManager.transition('voice_input');
          if (!success) {
            console.warn('[ASR] State transition failed');
            isRecording = false;
            return;
          }
        }

        notifyRenderer("asr:connecting");
        initAsrConnection();
        windowManager.createOverlayWindow();
        windowManager.createAsrTextWindow();
        caretTracker.startTracking(100, () => {
          windowManager.positionOverlayAtCaret();
        });
      } else {
        console.log("[ASR] Stopping recording - immediate shutdown");

        if (pendingText && pendingText.trim()) {
          console.log(`[ASR] Stop recording - injecting remaining text: "${pendingText}"`);
          const textToInject = (accumulatedAsrText + " " + pendingText).trim();
          injectText(textToInject)
            .then(() => console.log("[ASR] Remaining text injected"))
            .catch(err => console.error("[ASR] Failed to inject remaining text:", err.message));
        }

        if (asrWs) {
          stopHeartbeat();
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          audioBufferQueue = [];
          if (asrWs.readyState === WebSocket.OPEN) {
            const stopMsg = {
              header: { namespace: "SpeechTranscriber", name: "StopTranscription" },
            };
            asrWs.send(JSON.stringify(stopMsg));
          }
          asrWs.close();
          asrWs = null;
        }

        isRecording = false;
        accumulatedAsrText = "";
        pendingText = "";
        asrFinalResultReceived = false;
        reconnectAttempts = 0;

        // Request state transition back to idle
        if (stateManager) {
          stateManager.transition('idle');
        }

        caretTracker.stopTracking();
        windowManager.hideOverlayWindow();
        windowManager.destroyAsrTextWindow();
        notifyRenderer("asr:recording-stopped");
      }
    });

    if (!ret) {
      console.error(`[ASR] Failed to register hotkey: ${ASR_CONFIG.hotkey}`);
    } else {
      console.log(`[ASR] Hotkey ${ASR_CONFIG.hotkey} registered`);
    }
  }

  function isConnected() {
    return asrWs && asrWs.readyState === WebSocket.OPEN;
  }

  function toggleRecording() {
    console.log(`[ASR] Toggle recording (current state: ${isRecording ? "recording" : "stopped"})`);
    
    // Check if recording summary is active - forbid transition
    if (stateManager && stateManager.isRecordingSummary()) {
      console.log('[ASR] Cannot start: recording summary is active');
      notifyRenderer('asr:error', '请先关闭录音纪要');
      return;
    }

    isRecording = !isRecording;

    if (isRecording) {
      // Request state transition to voice_input
      if (stateManager) {
        const success = stateManager.transition('voice_input');
        if (!success) {
          console.warn('[ASR] State transition failed');
          isRecording = false;
          return;
        }
      }

      notifyRenderer("asr:connecting");
      initAsrConnection();
      windowManager.createOverlayWindow();
      windowManager.createAsrTextWindow();
      caretTracker.startTracking(100, () => {
        windowManager.positionOverlayAtCaret();
      });
    } else {
      console.log("[ASR] Stopping recording - immediate shutdown");

      if (pendingText && pendingText.trim()) {
        console.log(`[ASR] Stop recording - injecting remaining text: "${pendingText}"`);
        const textToInject = (accumulatedAsrText + " " + pendingText).trim();
        injectText(textToInject)
          .then(() => console.log("[ASR] Remaining text injected"))
          .catch(err => console.error("[ASR] Failed to inject remaining text:", err.message));
      }

      if (asrWs) {
        stopHeartbeat();
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        audioBufferQueue = [];
        if (asrWs.readyState === WebSocket.OPEN) {
          const stopMsg = {
            header: { namespace: "SpeechTranscriber", name: "StopTranscription" },
          };
          asrWs.send(JSON.stringify(stopMsg));
        }
        asrWs.close();
        asrWs = null;
      }

      isRecording = false;
      accumulatedAsrText = "";
      pendingText = "";
      asrFinalResultReceived = false;
      reconnectAttempts = 0;

      // Request state transition back to idle
      if (stateManager) {
        stateManager.transition('idle');
      }

      caretTracker.stopTracking();
      windowManager.hideOverlayWindow();
      windowManager.destroyAsrTextWindow();
      notifyRenderer("asr:recording-stopped");
    }
  }

  return {
    registerHotkey,
    closeAsrConnection,
    sendAudioChunk,
    isConnected,
    toggleRecording,
  };
}

module.exports = { createAsrManager };
