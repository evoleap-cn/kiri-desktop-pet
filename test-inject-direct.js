/**
 * Quick test for text injection
 * Run this, then quickly switch to a text input field
 */

const { app } = require('electron');
const path = require('path');

// Mock electron modules for testing
const mockModules = {
  electron: {
    clipboard: {
      readText: () => '',
      writeText: () => {}
    }
  },
  child_process: {
    exec: (cmd, cb) => cb(null, '', '')
  }
};

// Override require for mock
const originalRequire = require;

console.log('=== Direct Text Injection Test ===\n');
console.log('Loading text injector...\n');

// Load the actual injector
const injectorPath = path.join(__dirname, 'src', 'asr', 'text-injector.js');
const { injectText } = require(injectorPath);

// Test text
const testText = '你好世界 Hello World';

console.log(`Test text: "${testText}"`);
console.log('You have 3 seconds to focus a text input field...\n');

let count = 3;
const interval = setInterval(() => {
  console.log(`  ${count}...`);
  count--;
  
  if (count <= 0) {
    clearInterval(interval);
    console.log('\nInjecting text NOW...\n');
    
    injectText(testText)
      .then(() => {
        console.log('✓ SUCCESS: Text should have appeared in the input field');
        console.log('  Did you see the text? If not, check above logs for errors.');
      })
      .catch(err => {
        console.log('✗ FAILED:', err.message);
        console.log('  Check stack trace above for details.');
      })
      .finally(() => {
        console.log('\n=== Test Complete ===');
        setTimeout(() => process.exit(0), 1000);
      });
  }
}, 1000);
