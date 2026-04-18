/**
 * Text injector for Windows
 * 
 * Priority order:
 * 1. Native C++ addon (KEYEVENTF_UNICODE via SendInput API) - bypasses IME, doesn't touch clipboard
 * 2. Fallback: Clipboard + Ctrl+V method (for non-Windows platforms or if native module fails)
 */

const os = require('os');
const path = require('path');
const build = require('node-gyp-build');

// Try to load native Windows text injector
let nativeInjector = null;
try {
  if (os.platform() === 'win32') {
    console.log('[TextInjector] Trying to load native injector using node-gyp-build...');
    // node-gyp-build automatically searches prebuilds/ and build/ directories
    nativeInjector = build(path.join(__dirname, '..', '..'));
    console.log('[TextInjector] Native Windows injector loaded successfully');
  }
} catch (err) {
  console.warn('[TextInjector] Native injector not available, will use clipboard fallback');
  console.warn('[TextInjector] Error:', err.message);
}

/**
 * Inject text using native KEYEVENTF_UNICODE method (Windows only)
 */
function injectTextNative(text) {
  return new Promise((resolve, reject) => {
    console.log('[TextInjector] Native inject called with:', text.substring(0, 50));
    
    if (!nativeInjector) {
      console.error('[TextInjector] Native injector is null!');
      reject(new Error('Native injector not loaded'));
      return;
    }

    try {
      console.log('[TextInjector] Calling nativeInjector.injectText()...');
      const success = nativeInjector.injectText(text);
      console.log('[TextInjector] Native inject returned:', success);
      
      if (success) {
        console.log(`[TextInjector] Native inject successful: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
        resolve();
      } else {
        const err = new Error('SendInput API returned false (failed)');
        console.error('[TextInjector]', err.message);
        reject(err);
      }
    } catch (err) {
      console.error('[TextInjector] Native inject exception:', err.message);
      console.error('[TextInjector] Stack:', err.stack);
      reject(err);
    }
  });
}

/**
 * Inject text into the active window using clipboard paste (fallback)
 * This approach is more reliable for Unicode characters (including Chinese)
 */
function injectTextClipboard(text) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    const { clipboard } = require("electron");

    if (!text || !text.trim()) {
      resolve();
      return;
    }

    try {
      // Save current clipboard content
      const prevClipboard = clipboard.readText();

      // Set new text to clipboard
      clipboard.writeText(text);

      // Use PowerShell to send Ctrl+V
      const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")`;

      exec(`powershell -NoProfile -Command "${psCommand}"`, (error, stdout, stderr) => {
        // Restore original clipboard content
        clipboard.writeText(prevClipboard);

        if (error) {
          console.error(`[TextInjector] PowerShell error: ${error.message}`);
          reject(error);
          return;
        }

        console.log(`[TextInjector] Clipboard inject successful: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
        resolve();
      });
    } catch (err) {
      console.error(`[TextInjector] Failed to inject text: ${err.message}`);
      reject(err);
    }
  });
}

/**
 * Main inject function - tries native first, falls back to clipboard
 * @param {string} text - Text to inject
 * @returns {Promise<void>}
 */
function injectText(text) {
  if (!text || !text.trim()) {
    return Promise.resolve();
  }

  // Try native injector first on Windows
  if (nativeInjector) {
    return injectTextNative(text).catch(err => {
      console.warn('[TextInjector] Native inject failed, trying clipboard fallback:', err.message);
      return injectTextClipboard(text);
    });
  }
  
  // Use clipboard method on non-Windows or if native module unavailable
  return injectTextClipboard(text);
}

module.exports = { injectText };
