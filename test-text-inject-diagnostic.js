/**
 * Diagnostic script for testing KEYEVENTF_UNICODE text injection
 */

const os = require('os');
const path = require('path');

console.log('=== KEYEVENTF_UNICODE Diagnostic ===\n');
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());
console.log('Node version:', process.version);
console.log('');

if (os.platform() !== 'win32') {
  console.log('ERROR: This test only works on Windows!');
  process.exit(1);
}

// Test 1: Load native module
console.log('Test 1: Loading native module...');
const injectorPath = path.join(__dirname, 'build', 'Release', 'win_text_injector.node');
console.log('Path:', injectorPath);

let injector;
try {
  injector = require(injectorPath);
  console.log('✓ Native module loaded successfully');
  console.log('  Exported functions:', Object.keys(injector).join(', '));
} catch (err) {
  console.log('✗ Failed to load native module:', err.message);
  process.exit(1);
}

// Test 2: Check if we have admin rights (SendInput may need it)
console.log('\nTest 2: Checking permissions...');
const { execSync } = require('child_process');
try {
  execSync('net session', { stdio: 'ignore' });
  console.log('✓ Running with admin privileges');
} catch (err) {
  console.log('⚠ Not running as admin (SendInput may still work)');
}

// Test 3: Send a test character
console.log('\nTest 3: Sending test character...');
console.log('You have 5 seconds to focus a text input field...');
console.log('Starting in: 5...');

let count = 5;
const countdown = setInterval(() => {
  count--;
  if (count > 0) {
    console.log(`  ${count}...`);
  } else {
    clearInterval(countdown);
    
    console.log('\nSending "A" character...');
    try {
      const result = injector.sendTestChar();
      if (result) {
        console.log('✓ sendTestChar returned SUCCESS');
        console.log('  Did you see "A" appear in the text field?');
      } else {
        console.log('✗ sendTestChar returned FAILED');
        console.log('  SendInput API call failed');
      }
    } catch (err) {
      console.log('✗ Exception during sendTestChar:', err.message);
    }
    
    // Test 4: Send a full string
    console.log('\n\nTest 4: Sending full string...');
    console.log('You have 5 seconds to focus a text input field...');
    console.log('Starting in: 5...');
    
    let count2 = 5;
    const countdown2 = setInterval(() => {
      count2--;
      if (count2 > 0) {
        console.log(`  ${count2}...`);
      } else {
        clearInterval(countdown2);
        
        console.log('\nSending "Hello 你好"...');
        try {
          const result = injector.injectText('Hello 你好');
          if (result) {
            console.log('✓ injectText returned SUCCESS');
            console.log('  Did you see "Hello 你好" appear in the text field?');
          } else {
            console.log('✗ injectText returned FAILED');
          }
        } catch (err) {
          console.log('✗ Exception during injectText:', err.message);
        }
        
        console.log('\n=== Diagnostic Complete ===');
        console.log('If tests succeeded but ASR still doesn\'t work, check:');
        console.log('  1. Electron app logs for [TextInjector] messages');
        console.log('  2. Whether overlay window is stealing focus');
        console.log('  3. Timing issues (text injection before window loses focus)');
      }
    }, 1000);
  }
}, 1000);
