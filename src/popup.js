// Popup renderer — handles menu interactions
const searchInput = document.getElementById("pet-search-input");
const recordingSummaryBtn = document.getElementById("menu-recording-summary");

if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      window.electronAPI.menuAction("search:" + searchInput.value.trim());
    }
    if (e.key === "Escape") {
      window.electronAPI.menuAction("cancel");
    }
  });
  searchInput.focus();
}

document.querySelectorAll(".pet-menu-item").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    window.electronAPI.menuAction(el.dataset.action);
  });
});

// Escape closes popup
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.electronAPI.menuAction("cancel");
  }
});

// ─── Recording Summary State UI ──────────────────────────────────────────────

function setRecordingState(isRecording) {
  if (!recordingSummaryBtn) return;
  
  if (isRecording) {
    recordingSummaryBtn.classList.add("recording");
    recordingSummaryBtn.querySelector("span").textContent = "正在录音";
    recordingSummaryBtn.style.pointerEvents = "none";
  } else {
    recordingSummaryBtn.classList.remove("recording");
    recordingSummaryBtn.querySelector("span").textContent = "录音纪要";
    recordingSummaryBtn.style.pointerEvents = "auto";
  }
}

// Listen for recording state changes from main process
if (window.electronAPI.onSummaryRecordingStarted) {
  window.electronAPI.onSummaryRecordingStarted(() => {
    setRecordingState(true);
  });
}

if (window.electronAPI.onSummaryRecordingStopped) {
  window.electronAPI.onSummaryRecordingStopped(() => {
    setRecordingState(false);
  });
}

// Close popup when focus is lost (handled in main.js via popupWin.on("blur"))
