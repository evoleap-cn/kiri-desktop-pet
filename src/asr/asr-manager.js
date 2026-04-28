const WebSocket = require("ws");
const { globalShortcut } = require("electron");

function createAsrManager({ getWin, windowManager, injectText, caretTracker, stateManager, getSettings }) {
  // 动态获取 ASR 配置，支持运行时更新
  function getAsrConfig() {
    const settings = getSettings ? getSettings() : {};
    let serverUrl = process.env.ASR_SERVER_URL || settings.asrServerUrl || "ws://192.168.1.66:8000/ws/v1/asr";
    
    // 确保 URL 包含完整路径
    if (!serverUrl.includes('/ws/')) {
      const baseUrl = serverUrl.replace(/\/+$/, '');
      serverUrl = `${baseUrl}/ws/v1/asr`;
    }
    
    return {
      serverUrl,
      hotkey: settings.asrHotkey || "F9",
      sampleRate: 16000,
      heartbeatInterval: 30000,
      reconnectDelay: 3000,
    };
  }

  const MAX_RECONNECT_ATTEMPTS = 10;

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
    const config = getAsrConfig();
    heartbeatTimer = setInterval(() => {
      if (asrWs && asrWs.readyState === WebSocket.OPEN) {
        asrWs.ping();
      }
    }, config.heartbeatInterval);
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
    const config = getAsrConfig();
    
    if (asrWs && (asrWs.readyState === WebSocket.CONNECTING || asrWs.readyState === WebSocket.OPEN)) {
      console.log("[ASR] Connection already exists");
      return;
    }

    console.log(`[ASR] Connecting to ${config.serverUrl}...`);
    asrWs = new WebSocket(config.serverUrl);

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
          sample_rate: config.sampleRate,
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
          const errorMsg = msg.payload?.status_text || msg.header?.status_message || "ASR task failed";
          const errorCode = msg.payload?.status_code || msg.header?.status_code || "unknown";
          console.error("[ASR] Task failed:", errorMsg, "Error code:", errorCode);
          console.error("[ASR] Full error message:", JSON.stringify(msg, null, 2));
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
        const config = getAsrConfig();
        console.log(`[ASR] Reconnecting... attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        notifyRenderer("asr:status", `正在重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnectTimer = setTimeout(() => {
          initAsrConnection();
        }, config.reconnectDelay);
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
      let bufferToSend;
      
      // 处理不同类型的 buffer
      if (buffer instanceof Int16Array) {
        // Int16Array 直接转为 Buffer
        bufferToSend = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      } else if (buffer instanceof ArrayBuffer) {
        // ArrayBuffer 转为 Int16Array 再转为 Buffer
        const int16 = new Int16Array(buffer);
        bufferToSend = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
      } else if (Buffer.isBuffer(buffer)) {
        bufferToSend = buffer;
      } else {
        // 其他类型（如普通对象）尝试转换
        console.warn(`[ASR] Unexpected buffer type: ${typeof buffer}, converting...`);
        const int16 = new Int16Array(Object.values(buffer));
        bufferToSend = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
      }
      
      console.log(`[ASR] Sending audio chunk: ${bufferToSend.length} bytes`);
      asrWs.send(bufferToSend, { binary: true });
    } else if (asrWs && asrWs.readyState === WebSocket.CONNECTING) {
      let bufferToQueue;
      if (buffer instanceof Int16Array) {
        bufferToQueue = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      } else if (buffer instanceof ArrayBuffer) {
        const int16 = new Int16Array(buffer);
        bufferToQueue = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
      } else {
        bufferToQueue = Buffer.from(buffer);
      }
      audioBufferQueue.push(bufferToQueue);
      console.log(`[ASR] Queuing audio chunk, queue size: ${audioBufferQueue.length}`);
    } else {
      console.warn('[ASR] Cannot send audio chunk - WebSocket not connected');
    }
  }

  // ─── Hotkey ──────────────────────────────────────────────────────────────────

  function registerHotkey() {
    const config = getAsrConfig();
    const ret = globalShortcut.register(config.hotkey, () => {
      console.log(`[ASR] Hotkey ${config.hotkey} pressed`);
      
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
      console.error(`[ASR] Failed to register hotkey: ${config.hotkey}`);
    } else {
      console.log(`[ASR] Hotkey ${config.hotkey} registered`);
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
