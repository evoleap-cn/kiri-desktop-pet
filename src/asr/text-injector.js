/**
 * Text injector for Windows - uses clipboard + Ctrl+V method
 * This approach is more reliable for Unicode characters (including Chinese)
 */

const { exec } = require("child_process");
const { clipboard } = require("electron");

/**
 * Inject text into the active window using clipboard paste
 * @param {string} text - Text to inject
 * @returns {Promise<void>}
 */
function injectText(text) {
  return new Promise((resolve, reject) => {
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

        console.log(`[TextInjector] Text injected successfully: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
        resolve();
      });
    } catch (err) {
      console.error(`[TextInjector] Failed to inject text: ${err.message}`);
      reject(err);
    }
  });
}

module.exports = { injectText };
