/**
 * Direct test of the native C++ module (no Electron needed)
 */

const path = require('path');
const os = require('os');

console.log('=== Native Module Direct Test ===\n');

if (os.platform() !== 'win32') {
  console.log('Only works on Windows!');
  process.exit(1);
}

// Load native module
const nativeModule = require(path.join(__dirname, 'build', 'Release', 'win_text_injector.node'));

console.log('Native module loaded:', Object.keys(nativeModule));
console.log('');

const testText = 'Hello 你好';
console.log(`Test text: "${testText}"`);
console.log('You have 3 seconds to focus a text input field...\n');

let count = 3;
const interval = setInterval(() => {
  console.log(`  ${count}...`);
  count--;
  
  if (count <= 0) {
    clearInterval(interval);
    console.log('\nInjecting text NOW...\n');
    
    const result = nativeModule.injectText(testText);
    
    if (result) {
      console.log('✓ Native module returned SUCCESS');
      console.log('  Did you see the text appear?');
    } else {
      console.log('✗ Native module returned FAILED');
      console.log('  SendInput API call failed');
    }
    
    console.log('\n=== Test Complete ===');
    setTimeout(() => process.exit(0), 1000);
  }
}, 1000);
