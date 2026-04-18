/**
 * ASR text window renderer
 * Shows streaming ASR text in a separate window below the pet
 */

const asrText = document.getElementById('asr-text');

// Listen for text updates from main process
window.asrTextAPI.onUpdateText((text) => {
  if (text) {
    asrText.textContent = text;
    asrText.classList.remove('injected');
  } else {
    asrText.textContent = '';
  }
});

window.asrTextAPI.onFlashInjected(() => {
  asrText.classList.add('injected');
});
