/**
 * Overlay window renderer for ASR caret-following display
 * Shows streaming (uncommitted) text at the caret position
 */

const textDisplay = document.getElementById('text-display');

// Listen for text updates from main process via preload API
window.overlayAPI.onUpdateText((text) => {
  if (text) {
    textDisplay.textContent = text;
    textDisplay.classList.remove('final');
    textDisplay.style.display = 'block';
  } else {
    textDisplay.style.display = 'none';
  }
});

window.overlayAPI.onShowFinal((text) => {
  textDisplay.textContent = text;
  textDisplay.classList.add('final');
  textDisplay.style.display = 'block';
});

window.overlayAPI.onHide(() => {
  textDisplay.textContent = '';
  textDisplay.classList.remove('final');
  textDisplay.style.display = 'none';
});
